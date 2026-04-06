import { spawn, spawnSync, ChildProcess } from 'child_process';
import { cpus, totalmem, freemem } from 'os';
import { existsSync } from 'fs';
import { join } from 'path';
import { generateConfig } from './config-gen';
import { getProjectClient, cleanupProjectClient } from './project-client';
import { registerProjectManagementTools } from './zeroclaw-project-integration';
import { initializeTelegramBotCommands, shutdownTelegramBotCommands } from './telegram-integration';
import projectContextManager from './project-context-manager';
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

interface PendingLog {
  runId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

let currentRun: RunState | null = null;
let daemonProcess: ChildProcess | null = null;
let pendingLogs: PendingLog[] = [];
let metricsTimer: NodeJS.Timeout | null = null;
let logFlushTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let lastCpuUsage: NodeJS.CpuUsage = process.cpuUsage();
let lastCpuTime: number = Date.now();
let isShuttingDown = false;
let backendHealthy = false;

// ── Event handlers ──

async function onRunStart(event: RunStartEvent): Promise<void> {
  if (currentRun) return;

  try {
    const trigger = event.channel ? 'api' : 'manual';
    const metadata: Record<string, unknown> = {
      taskId: event.taskId,
      message: event.message,
      channel: event.channel,
      sender: event.sender,
    };

    // Attach active project context for auto-linking
    const senderId = event.sender || 'default';
    const chatId = event.channel || 'cli';
    const activeProject = projectContextManager.getActiveProject(senderId, chatId);
    if (activeProject) {
      metadata.projectId = activeProject.projectId;
      metadata.projectName = activeProject.projectName;
    }

    const result = await ingest.createRun(AGENT_NAME, trigger, metadata, {
      metadata,
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

  pendingLogs.push({
    runId: currentRun.runId,
    level: event.level,
    message: event.message,
    metadata: event.target ? { target: event.target } : undefined,
    timestamp: Date.now(),
  });

  if (pendingLogs.length >= MAX_LOG_BUFFER_SIZE) {
    const dropped = pendingLogs.splice(0, pendingLogs.length - MAX_LOG_BUFFER_SIZE);
    console.warn(`[reporter] Dropped ${dropped.length} oldest logs (buffer full)`);
  }
}

// ── Log batching ──

async function flushLogs(): Promise<void> {
  if (pendingLogs.length === 0) return;

  const batch = pendingLogs.splice(0, pendingLogs.length);
  try {
    await ingest.sendLogBatch(batch.map(l => ({
      runId: l.runId,
      level: l.level,
      message: l.message,
      metadata: l.metadata,
    })));
  } catch (err) {
    console.error(`[reporter] Failed to flush ${batch.length} logs, re-queueing:`, err);
    pendingLogs.unshift(...batch);
    throw err;
  }
}

// ── Graceful shutdown ──

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[reporter] Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`[reporter] Received ${signal}, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('[reporter] Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    // Stop timers
    if (metricsTimer) clearInterval(metricsTimer);
    if (logFlushTimer) clearInterval(logFlushTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    // Flush pending logs
    if (pendingLogs.length > 0) {
      console.log(`[reporter] Flushing ${pendingLogs.length} pending logs...`);
      await flushLogs();
    }

    // Complete current run if any
    if (currentRun) {
      console.log(`[reporter] Completing run ${currentRun.runId}...`);
      await ingest.completeRun(currentRun.runId, {
        status: 'failed',
        errorMessage: 'Agent shutdown',
        durationMs: Date.now() - currentRun.startedAt,
        totalTokensIn: currentRun.totalTokensIn,
        totalTokensOut: currentRun.totalTokensOut,
        totalCostUsd: currentRun.totalCostUsd.toFixed(6),
      });
    }

    // Cleanup project client
    await ingest.cleanupProjectClient().catch(err => {
      console.error('[reporter] Failed to cleanup project client:', err);
    });

    // Cleanup Telegram
    await ingest.shutdownTelegramBotCommands().catch(err => {
      console.error('[reporter] Failed to cleanup Telegram bot commands:', err);
    });

    // Kill daemon
    if (daemonProcess) {
      console.log('[reporter] Stopping daemon...');
      daemonProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        daemonProcess?.on('exit', () => resolve());
        setTimeout(() => {
          daemonProcess?.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }

    clearTimeout(shutdownTimeout);
    console.log('[reporter] Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('[reporter] Error during shutdown:', err);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// ── Heartbeat ──

async function sendHeartbeat(): Promise<void> {
  if (!currentRun || !backendHealthy) return;

  try {
    const healthy = await ingest.checkHealth();
    backendHealthy = healthy;
    if (!healthy) {
      console.warn('[reporter] Backend health check failed');
    }
  } catch (err) {
    backendHealthy = false;
    console.error('[reporter] Heartbeat failed:', err);
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
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  
  // Sync flush remaining logs
  if (pendingLogs.length > 0) {
    console.log(`[reporter] Warning: ${pendingLogs.length} logs still pending after cleanup`);
  }
}

// ── Daemon lifecycle ──

async function main(): Promise<void> {
  console.log('[reporter] claw-infra agent reporter starting');
  console.log(`[reporter] Agent name: ${AGENT_NAME}`);
  console.log(`[reporter] Backend: ${process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000'}`);
  console.log(`[reporter] Max retries: ${MAX_RETRIES}, Base delay: ${BASE_DELAY_MS}ms`);

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
  for (let i = 0; i < 30; i++) {
    backendHealthy = await ingest.checkHealth();
    if (backendHealthy) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!backendHealthy) {
    console.warn('[reporter] Backend not reachable after 60s — starting daemon anyway');
  } else {
    console.log('[reporter] Backend is healthy');
  }

  // Start periodic tasks
  metricsTimer = setInterval(collectMetrics, METRICS_INTERVAL_MS);
  logFlushTimer = setInterval(flushLogs, LOG_BATCH_INTERVAL_MS);
  heartbeatTimer = setInterval(sendHeartbeat, 30000); // Heartbeat every 30s

  daemonProcess = startDaemon();

  // Graceful shutdown handlers
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => gracefulShutdown(sig));
  }
}

// Start the agent
main().catch((err) => {
  console.error('[reporter] Fatal error:', err);
  process.exit(1);
});

