import { spawn, spawnSync, ChildProcess } from 'child_process';
import { cpus, totalmem, freemem } from 'os';
import { existsSync } from 'fs';
import { join } from 'path';
import { generateConfig } from './config-gen';
import { getProjectClient, cleanupProjectClient } from './project-client';
import { registerProjectManagementTools } from './zeroclaw-project-integration';
import { initializeTelegramBotCommands, shutdownTelegramBotCommands } from './telegram-integration';
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
const MAX_LOG_BUFFER_SIZE = parseInt(process.env.MAX_LOG_BUFFER_SIZE || '10000', 10);
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
let lastCpuUsage: NodeJS.CpuUsage = process.cpuUsage();
let lastCpuTime: number = Date.now();

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

  const tokensIn = event.tokensIn ?? 0;
  const tokensOut = event.tokensOut ?? 0;
  const costUsd = event.costUsd ?? 0;

  // Skip telemetry rows that carry no usage or cost signal.
  if (tokensIn <= 0 && tokensOut <= 0 && costUsd <= 0) {
    return;
  }

  currentRun.totalTokensIn += tokensIn;
  currentRun.totalTokensOut += tokensOut;
  currentRun.totalCostUsd += costUsd;

  try {
    await ingest.recordCost({
      runId: currentRun.runId,
      provider: event.provider,
      model: event.model,
      tokensIn,
      tokensOut,
      costUsd: costUsd.toFixed(6),
    });
  } catch (err) {
    console.error(`[reporter] Failed to record cost:`, err);
  }
}

function onLogLine(event: LogLineEvent): void {
  if (!currentRun) return;

  // Check buffer capacity and drop oldest if full
  if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) {
    logBuffer.shift(); // Remove oldest log
    
    // Log warning at 80% capacity (only once per run)
    if (logBuffer.length === Math.floor(MAX_LOG_BUFFER_SIZE * 0.8)) {
      console.warn(`[reporter] Log buffer at 80% capacity (${logBuffer.length}/${MAX_LOG_BUFFER_SIZE}), oldest logs will be dropped`);
    }
  }

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

  // Compute CPU% as a delta since the last sample to avoid cumulative drift
  const nowCpu = process.cpuUsage();
  const nowTime = Date.now();
  const elapsedUs = (nowTime - lastCpuTime) * 1000; // ms → µs
  const usedUs = (nowCpu.user - lastCpuUsage.user) + (nowCpu.system - lastCpuUsage.system);
  const cpuPercent = elapsedUs > 0 ? (usedUs / (elapsedUs * cpuCount)) * 100 : 0;
  lastCpuUsage = nowCpu;
  lastCpuTime = nowTime;

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

  const child = spawn(ZEROCLAW_BIN, [ZEROCLAW_CMD], {
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG || 'zeroclaw=info,zeroclaw::tools=debug,zeroclaw::providers=debug',
      GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '',
      ZEROCLAW_MAX_TOOL_ITERATIONS: process.env.ZEROCLAW_MAX_TOOL_ITERATIONS || '50',
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
  
  // Cleanup project client workspaces
  cleanupProjectClient().catch(err => {
    console.error('[reporter] Failed to cleanup project client:', err);
  });

  // Cleanup Telegram bot commands
  shutdownTelegramBotCommands().catch(err => {
    console.error('[reporter] Failed to cleanup Telegram bot commands:', err);
  });
}

// ── Main ──

async function main(): Promise<void> {
  console.log('[reporter] claw-infra agent reporter starting');
  console.log(`[reporter] Agent name: ${AGENT_NAME}`);
  console.log(`[reporter] Backend: ${process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000'}`);

  generateConfig();
  setupWorkspace();

  // Initialize project management client
  try {
    const projectClient = getProjectClient();
    console.log('[reporter] Project management client initialized');
    
    // Register project management tools with ZeroClaw
    registerProjectManagementTools();
    console.log('[reporter] Project management tools registered');
    
    console.log('[reporter] Project management CLI available at: /app/project-manager.js');
  } catch (err) {
    console.warn('[reporter] WARNING: Failed to initialize project client:', err);
  }

  // Initialize enhanced Telegram bot commands
  try {
    await initializeTelegramBotCommands();
    console.log('[reporter] Enhanced Telegram bot commands initialized');
  } catch (err) {
    console.warn('[reporter] WARNING: Failed to initialize Telegram bot commands:', err);
  }

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
  // ZeroClaw handles Telegram natively via [channels_config.telegram] in config.toml.
  // No custom orchestrator needed — [agent].max_tool_iterations controls iteration cap.

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

