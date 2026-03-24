const BACKEND_URL = (process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.AGENT_API_KEY || '';

interface RequestOptions {
  method: 'POST' | 'PATCH' | 'GET';
  path: string;
  body?: Record<string, unknown>;
}

async function request<T = unknown>(opts: RequestOptions): Promise<T> {
  const url = `${BACKEND_URL}/api${opts.path}`;
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': AGENT_TOKEN,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest API ${opts.method} ${opts.path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Runs ──

export interface CreateRunResult {
  id: string;
  agentName: string;
  status: string;
}

export async function createRun(agentName: string, trigger: string = 'manual', configSnapshot?: Record<string, unknown>, opts?: {
  metadata?: Record<string, unknown>;
  linkedCardId?: string;
}): Promise<CreateRunResult> {
  return request<CreateRunResult>({
    method: 'POST',
    path: '/ingest/runs',
    body: { agentName, trigger, configSnapshot, ...opts },
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
