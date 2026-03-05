import { spawn, spawnSync, ChildProcess } from 'child_process';
import { cpus, totalmem, freemem } from 'os';
import { existsSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import { generateConfig } from './config-gen';
import {
  ZeroClawLogParser,
  RunStartEvent,
  RunCompleteEvent,
  ToolCallEvent,
  ToolResultEvent,
  LlmCallEvent,
  LogLineEvent,
} from './log-parser';
import * as ingest from './ingest-client';

const AGENT_NAME = process.env.ZEROCLAW_AGENT_NAME || 'zeroclaw-primary';
const METRICS_INTERVAL_MS = parseInt(process.env.METRICS_INTERVAL_MS || '15000', 10);
const LOG_BATCH_INTERVAL_MS = parseInt(process.env.LOG_BATCH_INTERVAL_MS || '5000', 10);
const ZEROCLAW_BIN = process.env.ZEROCLAW_BIN || 'zeroclaw';
const ZEROCLAW_CMD = process.env.ZEROCLAW_CMD || 'daemon';

// ── State tracking ──

interface RunState {
  runId: string;
  stepIndex: number;
  stepMap: Map<string, string>; // toolName → stepId
  startedAt: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
}

let currentRun: RunState | null = null;
let daemonProcess: ChildProcess | null = null;
let logBuffer: Array<{
  runId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}> = [];
let metricsTimer: NodeJS.Timeout | null = null;
let logFlushTimer: NodeJS.Timeout | null = null;

// ── Event handlers ──

async function onRunStart(event: RunStartEvent): Promise<void> {
  if (currentRun) return;

  try {
    const trigger = event.channel ? 'api' : 'manual';
    const result = await ingest.createRun(AGENT_NAME, trigger, {
      taskId: event.taskId,
      message: event.message,
      channel: event.channel,
      sender: event.sender,
    });
    await ingest.startRun(result.id);

    currentRun = {
      runId: result.id,
      stepIndex: 0,
      stepMap: new Map(),
      startedAt: Date.now(),
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
    };

    console.log(`[reporter] Run started: ${result.id} (${event.channel || 'direct'}/${event.sender || 'unknown'})`);
  } catch (err) {
    console.error(`[reporter] Failed to create run:`, err);
  }
}

async function onRunComplete(event: RunCompleteEvent): Promise<void> {
  if (!currentRun) return;

  try {
    await ingest.completeRun(currentRun.runId, {
      status: event.success ? 'completed' : 'failed',
      durationMs: event.durationMs ?? (Date.now() - currentRun.startedAt),
      errorMessage: event.error,
      totalTokensIn: currentRun.totalTokensIn,
      totalTokensOut: currentRun.totalTokensOut,
      totalCostUsd: currentRun.totalCostUsd.toFixed(6),
    });

    console.log(`[reporter] Run ${event.success ? 'completed' : 'failed'}: ${currentRun.runId}`);
    currentRun = null;
  } catch (err) {
    console.error(`[reporter] Failed to complete run:`, err);
  }
}

async function onToolCall(event: ToolCallEvent): Promise<void> {
  if (!currentRun) return;

  try {
    const result = await ingest.createStep(currentRun.runId, currentRun.stepIndex, {
      toolName: event.toolName,
      stepName: `${event.toolName} invocation`,
      inputSummary: event.input?.substring(0, 500),
    });

    currentRun.stepMap.set(event.toolName, result.id);
    currentRun.stepIndex++;

    console.log(`[reporter] Step created: ${event.toolName} (${result.id})`);
  } catch (err) {
    console.error(`[reporter] Failed to create step:`, err);
  }
}

async function onToolResult(event: ToolResultEvent): Promise<void> {
  if (!currentRun) return;

  const stepId = currentRun.stepMap.get(event.toolName);
  if (!stepId) return;

  try {
    await ingest.completeStep(stepId, {
      status: event.success ? 'completed' : 'failed',
      durationMs: event.durationMs,
      outputSummary: event.output?.substring(0, 500),
      errorMessage: event.error,
    });

    currentRun.stepMap.delete(event.toolName);
  } catch (err) {
    console.error(`[reporter] Failed to complete step:`, err);
  }
}

async function onLlmCall(event: LlmCallEvent): Promise<void> {
  if (!currentRun) return;

  if (event.tokensIn) currentRun.totalTokensIn += event.tokensIn;
  if (event.tokensOut) currentRun.totalTokensOut += event.tokensOut;
  if (event.costUsd) currentRun.totalCostUsd += event.costUsd;

  try {
    await ingest.recordCost({
      runId: currentRun.runId,
      provider: event.provider,
      model: event.model,
      tokensIn: event.tokensIn ?? 0,
      tokensOut: event.tokensOut ?? 0,
      costUsd: (event.costUsd ?? 0).toFixed(6),
    });
  } catch (err) {
    console.error(`[reporter] Failed to record cost:`, err);
  }
}

function onLogLine(event: LogLineEvent): void {
  if (!currentRun) return;

  logBuffer.push({
    runId: currentRun.runId,
    level: event.level,
    message: event.message,
    metadata: event.target ? { target: event.target } : undefined,
  });
}

// ── Log batching ──

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;

  const batch = logBuffer.splice(0, logBuffer.length);
  try {
    await ingest.sendLogBatch(batch);
  } catch (err) {
    console.error(`[reporter] Failed to flush ${batch.length} logs:`, err);
  }
}

// ── Resource metrics ──

async function collectMetrics(): Promise<void> {
  const cpuCount = cpus().length;
  const totalMem = totalmem();
  const freeMem = freemem();
  const usedMem = totalMem - freeMem;

  const cpuUsage = process.cpuUsage();
  const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) * 100 / cpuCount;

  try {
    await ingest.sendMetrics({
      runId: currentRun?.runId,
      cpuPercent: Math.min(Math.round(cpuPercent * 100) / 100, 100),
      memoryMb: Math.round(usedMem / 1024 / 1024),
      memoryPercent: Math.round((usedMem / totalMem) * 10000) / 100,
    });
  } catch (err) {
    console.error(`[reporter] Failed to send metrics:`, err);
  }
}

// ── Telegram Orchestrator ──
// Replaces ZeroClaw's native Telegram channel to bypass the hardcoded
// 10-iteration-per-run cap that cannot be overridden via config.

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number };
  text?: string;
}

interface WebhookResponse {
  reply?: string;
  response?: string;
  message?: string;
  error?: string;
}

class TelegramOrchestrator {
  private offset = 0;
  private botToken: string;
  private gatewayUrl: string;
  private maxPhases: number;
  private allowedUsers: Set<string>;
  private ready = false;

  constructor() {
    this.botToken = process.env.ZEROCLAW_TELEGRAM_BOT_TOKEN || '';
    // Use the actual port ZeroClaw daemon listens on (8080 by default in the binary)
    const gatewayPort = process.env.ZEROCLAW_GATEWAY_PORT || '8080';
    this.gatewayUrl = process.env.ZEROCLAW_GATEWAY_URL || `http://localhost:${gatewayPort}`;
    this.maxPhases = parseInt(process.env.ORCHESTRATOR_MAX_PHASES || '8', 10);
    this.allowedUsers = new Set(
      (process.env.ZEROCLAW_TELEGRAM_ALLOWED_USERS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  get isEnabled(): boolean {
    return !!this.botToken;
  }

  /** Wait for ZeroClaw gateway to be ready before polling */
  async waitForGateway(maxWaitMs = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const res = await fetch(`${this.gatewayUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          console.log(`[orchestrator] ZeroClaw gateway ready at ${this.gatewayUrl}`);
          this.ready = true;
          return;
        }
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.warn('[orchestrator] Gateway not ready after 60s — polling anyway');
    this.ready = true;
  }

  async start(): Promise<void> {
    if (!this.isEnabled) {
      console.log('[orchestrator] No ZEROCLAW_TELEGRAM_BOT_TOKEN — Telegram orchestrator disabled');
      return;
    }

    await this.waitForGateway();
    console.log('[orchestrator] Telegram polling started');
    console.log(`[orchestrator] Allowed users: ${this.allowedUsers.size > 0 ? [...this.allowedUsers].join(', ') : 'all'}`);

    while (true) {
      try {
        await this.poll();
      } catch (err) {
        console.error('[orchestrator] Poll error:', err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  private async poll(): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.offset}&timeout=55`;
    const res = await fetch(url, { signal: AbortSignal.timeout(65000) });
    const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      this.offset = update.update_id + 1;
      if (update.message?.text) {
        // Fire and forget — don't await so next poll can start immediately
        this.handleMessage(update.message).catch((err) =>
          console.error('[orchestrator] Message error:', err),
        );
      }
    }
  }

  private isAllowed(msg: TelegramMessage): boolean {
    if (this.allowedUsers.size === 0) return true;
    const username = msg.from?.username || '';
    const userId = String(msg.from?.id || '');
    return this.allowedUsers.has(username) || this.allowedUsers.has(userId);
  }

  private async handleMessage(msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (!this.isAllowed(msg)) {
      console.log(`[orchestrator] Ignored message from unauthorized user: ${msg.from?.username || msg.from?.id}`);
      return;
    }

    console.log(`[orchestrator] Message from ${msg.from?.username || msg.from?.id}: ${text.substring(0, 80)}`);

    // Step 1: Ask ZeroClaw to plan whether this needs multiple phases
    const planPrompt =
      `ORCHESTRATOR PLANNING MODE — do not perform any actions yet, only plan.\n` +
      `User request: "${text}"\n\n` +
      `Determine if this needs multiple phases (each phase ≤ 8 tool calls) or is a single simple task.\n\n` +
      `If it fits in ONE phase: reply with exactly "SINGLE" on the first line, then describe the approach.\n` +
      `If it needs MULTIPLE phases: reply with exactly these lines (no other text before them):\n` +
      `PHASE 1: [specific action — what to do, on which files/repos]\n` +
      `PHASE 2: [next action]\n` +
      `(up to ${this.maxPhases} phases max)\n\n` +
      `Be concrete and specific. Each phase must be independently executable.`;

    await this.sendTelegram(chatId, '⏳ Planning...');

    let planResponse: string;
    try {
      planResponse = await this.callWebhook(planPrompt, 'plan');
    } catch (err) {
      await this.sendTelegram(chatId, `❌ Failed to reach ZeroClaw gateway: ${err}`);
      return;
    }

    // Check if single-phase
    const isSingle = planResponse.trimStart().toUpperCase().startsWith('SINGLE');
    const phases = (planResponse.match(/^PHASE \d+:.+$/gim) || []).slice(0, this.maxPhases);

    if (isSingle || phases.length === 0) {
      // Single phase — run directly
      await this.sendTelegram(chatId, '⏳ Working...');
      try {
        const result = await this.callWebhook(text, 'execute');
        await this.sendTelegram(chatId, result);
      } catch (err) {
        await this.sendTelegram(chatId, `❌ Error: ${err}`);
      }
      return;
    }

    // Multi-phase execution
    await this.sendTelegram(
      chatId,
      `📋 Breaking into ${phases.length} phases:\n${phases.map((p, i) => `${i + 1}. ${p.replace(/^PHASE \d+: /i, '')}`).join('\n')}`,
    );

    let context = `Original task: ${text}\n\nCompleted phases:\n`;

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const phaseLabel = `Phase ${i + 1}/${phases.length}`;
      await this.sendTelegram(chatId, `⚙️ ${phaseLabel}: ${phase.replace(/^PHASE \d+: /i, '')}`);

      const phasePrompt =
        `You are executing phase ${i + 1} of ${phases.length} for this task: "${text}"\n\n` +
        `Context from completed phases:\n${context}\n\n` +
        `NOW EXECUTE ONLY THIS PHASE (do not attempt other phases):\n${phase}\n\n` +
        `When done, summarize what you did in 2-3 sentences.`;

      let result: string;
      try {
        result = await this.callWebhook(phasePrompt, 'execute');
      } catch (err) {
        await this.sendTelegram(chatId, `❌ ${phaseLabel} failed: ${err}`);
        return;
      }

      context += `\n${phase}: ${result.substring(0, 600)}\n`;

      if (i < phases.length - 1) {
        await this.sendTelegram(chatId, `✅ ${phaseLabel} done.`);
      }
    }

    // Final summary (LLM-only is fine for summarization)
    const summaryPrompt =
      `Summarize what was accomplished in this task in 3-5 bullet points:\n` +
      `Original task: ${text}\n\nPhase results:\n${context}`;
    const summary = await this.callWebhook(summaryPrompt, 'plan').catch(() => context);
    await this.sendTelegram(chatId, `✅ All ${phases.length} phases complete!\n\n${summary}`);
  }

  private async callWebhook(message: string, mode: 'plan' | 'execute' = 'execute'): Promise<string> {
    // 'plan' mode → HTTP (LLM-only, fast, reliable — perfect for planning/summarization)
    // 'execute' mode → WebSocket first (has tool execution), HTTP fallback
    if (mode === 'plan') {
      console.log(`[orchestrator] Using HTTP for planning/summary`);
      return this.callHttpWebhook(message);
    }

    // Execution mode: try WebSocket first (tool execution), fall back to HTTP
    console.log(`[orchestrator] Using WebSocket for execution (tool calls enabled)`);
    try {
      const result = await this.callWsChat(message);
      return result;
    } catch (wsErr) {
      console.warn(`[orchestrator] WebSocket failed, falling back to HTTP:`, wsErr);
      return this.callHttpWebhook(message);
    }
  }

  private async callHttpWebhook(message: string): Promise<string> {
    const url = `${this.gatewayUrl}/webhook`;
    console.log(`[orchestrator] POST ${url} (${message.length} chars)`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(300000), // 5 min for complex tasks
    });

    const body = await res.text();
    console.log(`[orchestrator] HTTP webhook status=${res.status} body=${body.substring(0, 200)}`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${body.substring(0, 300)}`);
    }

    // Try to parse as JSON and extract reply
    try {
      const json = JSON.parse(body) as Record<string, unknown>;
      const reply =
        (typeof json['reply'] === 'string' && json['reply']) ||
        (typeof json['response'] === 'string' && json['response']) ||
        (typeof json['content'] === 'string' && json['content']) ||
        (typeof json['message'] === 'string' && json['message']) ||
        (typeof json['text'] === 'string' && json['text']) ||
        '';
      if (reply) return reply;
      // If no known field, return the entire JSON as a string
      return body;
    } catch {
      // Not JSON — return raw body
      return body || '(empty response)';
    }
  }

  private async callWsChat(message: string): Promise<string> {
    const wsUrl = this.gatewayUrl.replace(/^http/, 'ws') + '/ws/chat';
    console.log(`[orchestrator] WS connecting to ${wsUrl}`);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let reply = '';
      let resolved = false;
      let frameCount = 0;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(`[orchestrator] WS timeout after 300s (${frameCount} frames received, reply=${reply.substring(0, 100)})`);
          ws.terminate();
          // If we received some reply content, resolve with it instead of rejecting
          if (reply) {
            resolve(reply);
          } else {
            reject(new Error(`WebSocket agent timeout after 300s (${frameCount} frames received)`));
          }
        }
      }, 300000);

      ws.once('open', () => {
        console.log(`[orchestrator] WS connected, sending message`);
        ws.send(JSON.stringify({ message }));
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        frameCount++;
        const text = raw.toString();

        // Debug: log every frame (truncated)
        console.log(`[orchestrator] WS frame #${frameCount}: ${text.substring(0, 300)}`);

        try {
          const payload = JSON.parse(text) as Record<string, unknown>;

          // Capture any reply-like content from the frame
          if (typeof payload['reply'] === 'string') reply = payload['reply'];
          else if (typeof payload['content'] === 'string') reply = payload['content'];
          else if (typeof payload['response'] === 'string') reply = payload['response'];
          else if (typeof payload['text'] === 'string') reply = payload['text'];
          else if (typeof payload['message'] === 'string' && payload['type'] !== 'ping') reply = payload['message'];

          // Expanded done-signal detection
          const isDone =
            payload['done'] === true ||
            payload['type'] === 'done' ||
            payload['type'] === 'complete' ||
            payload['type'] === 'end' ||
            payload['type'] === 'reply_complete' ||
            payload['type'] === 'response_complete' ||
            payload['status'] === 'complete' ||
            payload['status'] === 'done' ||
            payload['event'] === 'done' ||
            payload['event'] === 'complete' ||
            payload['finished'] === true;

          if (isDone) {
            console.log(`[orchestrator] WS done signal received at frame #${frameCount}`);
            clearTimeout(timer);
            resolved = true;
            ws.close();
            resolve(reply || '(no reply)');
          }
        } catch {
          // Plain text frame — accumulate
          reply += text;
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        console.log(`[orchestrator] WS closed (code=${code}, reason=${reason?.toString()}, frames=${frameCount})`);
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          resolve(reply || '(connection closed without reply)');
        }
      });

      ws.on('error', (err: Error) => {
        console.error(`[orchestrator] WS error:`, err.message);
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  private async sendTelegram(chatId: number, text: string): Promise<void> {
    // Telegram message limit is 4096 chars; truncate gracefully
    const truncated = text.length > 4000 ? text.substring(0, 3990) + '\n…(truncated)' : text;
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: truncated }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error(`[orchestrator] Failed to send Telegram message:`, err);
    }
  }
}

// ── Workspace setup ──

function setupWorkspace(): void {
  const githubToken = process.env.GITHUB_TOKEN || process.env.ZEROCLAW_GITHUB_TOKEN;
  const reposEnv = process.env.GITHUB_REPOS || '';
  const workspaceDir = process.env.ZEROCLAW_WORKSPACE || '/app/workspace';

  if (!reposEnv) return;

  const repos = reposEnv.split(',').map((r) => r.trim()).filter(Boolean);
  if (!repos.length) return;

  for (let repo of repos) {
    // Accept full GitHub URLs or bare org/repo slugs
    repo = repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .trim();

    const repoName = repo.split('/').pop() || repo.replace('/', '-');
    const dest = join(workspaceDir, repoName);
    const cloneUrl = githubToken
      ? `https://x-access-token:${githubToken}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;

    if (existsSync(join(dest, '.git'))) {
      console.log(`[workspace] Pulling latest: ${repo}`);
      const result = spawnSync('git', ['-C', dest, 'pull', '--ff-only'], { stdio: 'pipe' });
      if (result.status === 0) {
        console.log(`[workspace] Pulled: ${repo}`);
      } else {
        console.warn(`[workspace] Pull failed for ${repo}: ${result.stderr?.toString().trim()}`);
      }
    } else {
      console.log(`[workspace] Cloning: ${repo} → ${dest}`);
      const result = spawnSync('git', ['clone', '--depth=1', cloneUrl, dest], { stdio: 'pipe' });
      if (result.status === 0) {
        console.log(`[workspace] Cloned: ${repo}`);
      } else {
        console.warn(`[workspace] Clone failed for ${repo}: ${result.stderr?.toString().trim()}`);
      }
    }
  }
}

// ── Daemon lifecycle ──

function startDaemon(): ChildProcess {
  console.log(`[reporter] Starting: ${ZEROCLAW_BIN} ${ZEROCLAW_CMD}`);

  const maxIter = process.env.ZEROCLAW_MAX_TOOL_ITERATIONS || '200';
  const child = spawn(ZEROCLAW_BIN, [ZEROCLAW_CMD], {
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG || 'zeroclaw=info,zeroclaw::tools=debug,zeroclaw::providers=debug',
      GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '',
      ZEROCLAW_MAX_TOOL_ITERATIONS: maxIter,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const parser = new ZeroClawLogParser();

  parser.on('run_start', (e: RunStartEvent) => onRunStart(e));
  parser.on('run_complete', (e: RunCompleteEvent) => onRunComplete(e));
  parser.on('tool_call', (e: ToolCallEvent) => onToolCall(e));
  parser.on('tool_result', (e: ToolResultEvent) => onToolResult(e));
  parser.on('llm_call', (e: LlmCallEvent) => onLlmCall(e));
  parser.on('log', (e: LogLineEvent) => onLogLine(e));

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);
    parser.feed(text);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stderr.write(text);
    parser.feed(text);
  });

  child.on('exit', (code, signal) => {
    console.log(`[reporter] ZeroClaw exited (code=${code}, signal=${signal})`);
    parser.flush();

    if (currentRun) {
      onRunComplete({
        type: 'run_complete',
        success: code === 0,
        error: code !== 0 ? `Process exited with code ${code}` : undefined,
        timestamp: new Date(),
      });
    }

    cleanup();

    if (code !== 0 && code !== null) {
      console.log(`[reporter] Restarting in 5s...`);
      setTimeout(() => {
        daemonProcess = startDaemon();
      }, 5000);
    }
  });

  return child;
}

function cleanup(): void {
  if (metricsTimer) clearInterval(metricsTimer);
  if (logFlushTimer) clearInterval(logFlushTimer);
  flushLogs();
}

// ── Main ──

async function main(): Promise<void> {
  console.log('[reporter] claw-infra agent reporter starting');
  console.log(`[reporter] Agent name: ${AGENT_NAME}`);
  console.log(`[reporter] Backend: ${process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000'}`);

  generateConfig();
  setupWorkspace();

  console.log('[reporter] Waiting for claw-infra backend...');
  let backendReady = false;
  for (let i = 0; i < 30; i++) {
    backendReady = await ingest.checkHealth();
    if (backendReady) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!backendReady) {
    console.warn('[reporter] Backend not reachable after 60s — starting daemon anyway');
  } else {
    console.log('[reporter] Backend is healthy');
  }

  metricsTimer = setInterval(collectMetrics, METRICS_INTERVAL_MS);
  logFlushTimer = setInterval(flushLogs, LOG_BATCH_INTERVAL_MS);

  daemonProcess = startDaemon();

  // NOTE: TelegramOrchestrator is disabled. ZeroClaw's native Telegram channel
  // is enabled in config-gen.ts for tool execution. The custom orchestrator's
  // WebSocket approach does not work (/ws/chat returns 0 frames when channel
  // supervisor is disabled). If a future ZeroClaw version fixes /ws/chat,
  // the orchestrator can be re-enabled to bypass the 10-iteration cap.
  //
  // const orchestrator = new TelegramOrchestrator();
  // orchestrator.start().catch((err) => console.error('[orchestrator] Fatal:', err));

  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      console.log(`[reporter] Received ${sig}, shutting down...`);
      daemonProcess?.kill(sig);
      cleanup();
      setTimeout(() => process.exit(0), 3000);
    });
  }
}

main().catch((err) => {
  console.error('[reporter] Fatal error:', err);
  process.exit(1);
});
