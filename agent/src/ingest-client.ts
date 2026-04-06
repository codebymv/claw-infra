const BACKEND_URL = (process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.AGENT_API_KEY || '';

export const MAX_RETRIES = parseInt(process.env.INGEST_MAX_RETRIES || '5', 10);
export const BASE_DELAY_MS = parseInt(process.env.INGEST_BASE_DELAY_MS || '1000', 10);
const MAX_DELAY_MS = parseInt(process.env.INGEST_MAX_DELAY_MS || '30000', 10);
const JITTER_FACTOR = parseFloat(process.env.INGEST_JITTER_FACTOR || '0.3');

interface RequestOptions {
  method: 'POST' | 'PATCH' | 'GET';
  path: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  skipRetry?: boolean;
}

interface PendingRequest {
  opts: RequestOptions;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  attempts: number;
  nextDelay: number;
}

let requestQueue: PendingRequest[] = [];
let isProcessingQueue = false;
let isBackendHealthy = true;

function calculateDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  const jitter = cappedDelay * JITTER_FACTOR * Math.random();
  return Math.round(cappedDelay + jitter);
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

async function requestWithRetry<T = unknown>(opts: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const pending: PendingRequest = {
      opts,
      resolve: resolve as (value: unknown) => void,
      reject,
      attempts: 0,
      nextDelay: BASE_DELAY_MS,
    };
    requestQueue.push(pending);
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const pending = requestQueue.shift();
    if (!pending) break;

    try {
      const result = await executeRequest(pending.opts);
      pending.resolve(result);
    } catch (error) {
      if (pending.opts.skipRetry || pending.attempts >= MAX_RETRIES) {
        pending.reject(error);
        continue;
      }

      pending.attempts++;
      pending.nextDelay = calculateDelay(pending.attempts);
      
      console.warn(
        `[ingest] Request failed (attempt ${pending.attempts}/${MAX_RETRIES}), retrying in ${pending.nextDelay}ms:`,
        error instanceof Error ? error.message : error
      );

      await new Promise(r => setTimeout(r, pending.nextDelay));
      requestQueue.unshift(pending);
    }
  }

  isProcessingQueue = false;
}

async function executeRequest<T = unknown>(opts: RequestOptions): Promise<T> {
  const url = `${BACKEND_URL}/api${opts.path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Agent-Token': AGENT_TOKEN,
  };

  if (opts.idempotencyKey) {
    headers['X-Idempotency-Key'] = opts.idempotencyKey;
  }

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    
    if (isRetryable(res.status)) {
      throw new Error(`Retryable error: ${res.status}`);
    }
    
    throw new Error(`Ingest API ${opts.method} ${opts.path} → ${res.status}: ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

async function request<T = unknown>(opts: RequestOptions): Promise<T> {
  return requestWithRetry<T>(opts);
}

// ── Runs ──

export interface CreateRunResult {
  id: string;
  agentName: string;
  status: string;
}

let runCounter = 0;
function generateIdempotencyKey(prefix: string): string {
  const timestamp = Date.now();
  const counter = ++runCounter;
  return `${prefix}-${timestamp}-${counter}`;
}

export async function createRun(agentName: string, trigger: string = 'manual', configSnapshot?: Record<string, unknown>, opts?: {
  metadata?: Record<string, unknown>;
  linkedCardId?: string;
}): Promise<CreateRunResult> {
  return request<CreateRunResult>({
    method: 'POST',
    path: '/ingest/runs',
    body: { agentName, trigger, configSnapshot, ...opts },
    idempotencyKey: generateIdempotencyKey('run'),
  });
}

export async function startRun(runId: string): Promise<void> {
  await request({ method: 'POST', path: `/ingest/runs/${runId}/start` });
}

export async function completeRun(runId: string, opts: {
  status: 'completed' | 'failed' | 'cancelled';
  durationMs?: number;
  errorMessage?: string;
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCostUsd?: string;
}): Promise<void> {
  await request({
    method: 'PATCH',
    path: `/ingest/runs/${runId}/status`,
    body: {
      ...opts,
      completedAt: new Date().toISOString(),
    },
  });
}

// ── Steps ──

export interface CreateStepResult {
  id: string;
  stepIndex: number;
}

export async function createStep(runId: string, stepIndex: number, opts?: {
  toolName?: string;
  stepName?: string;
  inputSummary?: string;
}): Promise<CreateStepResult> {
  return request<CreateStepResult>({
    method: 'POST',
    path: `/ingest/runs/${runId}/steps`,
    body: { stepIndex, ...opts },
  });
}

export async function completeStep(stepId: string, opts: {
  status: 'completed' | 'failed';
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  modelUsed?: string;
  provider?: string;
  costUsd?: string;
  outputSummary?: string;
  errorMessage?: string;
}): Promise<void> {
  await request({
    method: 'PATCH',
    path: `/ingest/steps/${stepId}/status`,
    body: opts,
  });
}

// ── Costs ──

export async function recordCost(opts: {
  runId: string;
  stepId?: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: string;
}): Promise<void> {
  await request({ method: 'POST', path: '/ingest/costs', body: opts });
}

// ── Logs ──

export async function sendLog(opts: {
  runId: string;
  stepId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await request({ method: 'POST', path: '/ingest/logs', body: opts });
}

export async function sendLogBatch(logs: Array<{
  runId: string;
  stepId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}>): Promise<void> {
  await request({ method: 'POST', path: '/ingest/logs/batch', body: { logs } });
}

// ── Metrics ──

export async function sendMetrics(opts: {
  runId?: string;
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  activeConnections?: number;
  logBufferSize?: number;
}): Promise<void> {
  await request({ method: 'POST', path: '/ingest/metrics', body: opts });
}

// ── GitHub Token ──

/** Fetch a GitHub installation token from the backend (requires JWT or falls back to env var) */
export async function fetchGithubToken(): Promise<string | null> {
  try {
    const url = `${BACKEND_URL}/api/github/status`;
    const res = await fetch(url, {
      headers: { 'X-Agent-Token': AGENT_TOKEN },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { configured: boolean; installUrl: string | null };
    if (!data.configured) return null;

    // The agent can't call JWT-guarded endpoints directly, so the token resolution
    // happens server-side through the code provider. The agent only needs env var fallback.
    return process.env.GITHUB_TOKEN || process.env.ZEROCLAW_GITHUB_TOKEN || null;
  } catch {
    return process.env.GITHUB_TOKEN || process.env.ZEROCLAW_GITHUB_TOKEN || null;
  }
}

// ── Health check ──

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
