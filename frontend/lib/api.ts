const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message: string }).message || 'Request failed');
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// --- Auth ---
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; user: { id: string; email: string; role: string; displayName: string } }>(
      '/auth/login',
      { email, password },
    ),
  register: (email: string, password: string, displayName?: string) =>
    api.post('/auth/register', { email, password, displayName }),
};

// --- Agents ---
export const agentsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<AgentRunsResponse>(`/agents${qs}`);
  },
  getById: (id: string) => api.get<AgentRun>(`/agents/${id}`),
  getSteps: (id: string) => api.get<AgentStep[]>(`/agents/${id}/steps`),
  getStats: () => api.get<DashboardStats>('/agents/stats'),
  getTimeline: (days?: number) => api.get<TimelinePoint[]>(`/agents/timeline?days=${days || 7}`),
  getActive: () => api.get<AgentRun[]>('/agents/active'),
  cancel: (id: string) => api.delete(`/agents/${id}/cancel`),
};

// --- Costs ---
export const costsApi = {
  getSummary: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CostSummary>(`/costs/summary${qs}`);
  },
  getByModel: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CostByModel[]>(`/costs/by-model${qs}`);
  },
  getByAgent: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CostByAgent[]>(`/costs/by-agent${qs}`);
  },
  getTrend: (days?: number) => api.get<CostTrendPoint[]>(`/costs/trend?days=${days || 30}`),
  getTopRuns: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<TopRun[]>(`/costs/top-runs${qs}`);
  },
  getBudgets: () => api.get<CostBudget[]>('/costs/budgets'),
  getBudgetStatus: () => api.get<BudgetStatus[]>('/costs/budgets/status'),
  upsertBudget: (data: Partial<CostBudget>) => api.post('/costs/budgets', data),
  getProjected: () => api.get<ProjectedSpend>('/costs/projected'),
};

// --- Metrics ---
export const metricsApi = {
  getLatest: () => api.get<ResourceSnapshot | null>('/metrics/latest'),
  getHistory: (resolution?: string) =>
    api.get<MetricsHistory[]>(`/metrics/history?resolution=${resolution || '1h'}`),
  getByAgent: () => api.get<AgentMetrics[]>('/metrics/by-agent'),
  getRunMetrics: (runId: string) => api.get<ResourceSnapshot[]>(`/metrics/runs/${runId}`),
};

// --- Logs ---
export const logsApi = {
  getRunLogs: (runId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<LogsResponse>(`/logs/runs/${runId}${qs}`);
  },
  getErrors: () => api.get<AgentLog[]>('/logs/errors'),
};

// --- API Keys ---
export const apiKeysApi = {
  list: () => api.get<ApiKeyEntry[]>('/auth/api-keys'),
  create: (name: string, type?: string) => api.post<{ key: string } & ApiKeyEntry>('/auth/api-keys', { name, type }),
  revoke: (id: string) => api.delete(`/auth/api-keys/${id}`),
};

// --- Code Visibility ---
export const codeApi = {
  getOverview: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CodeOverview>(`/code/overview${qs}`);
  },
  getTrends: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CodeTrendPoint[]>(`/code/trends${qs}`);
  },
  getPrs: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CodePrListResponse>(`/code/prs${qs}`);
  },
  getQuality: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CodeQuality>(`/code/quality${qs}`);
  },
  triggerBackfill: (repo?: string) => api.post<CodeBackfillResponse>('/code/sync/backfill', repo ? { repo } : {}),
};

// --- Types ---
export interface CodeBackfillResponse {
  accepted: boolean;
  message: string;
  syncStateId: string;
  scope: string;
}

export interface CodeOverview {
  prsOpened: number;
  prsMerged: number;
  commits: number;
  changedFiles: number;
  additions: number;
  deletions: number;
  netLines: number;
  reviewedPrs: number;
  averageMergeLatencySeconds: number | null;
  averageFirstReviewLatencySeconds: number | null;
}

export interface CodeTrendPoint {
  day: string;
  prsOpened: string;
  prsMerged: string;
  additions: string;
  deletions: string;
  changedFiles: string;
  avgMergeLatencySeconds: string | null;
  avgFirstReviewLatencySeconds: string | null;
}

export type CodePrState = 'open' | 'closed' | 'merged';

export interface CodePrRow {
  id: string;
  number: number;
  title: string;
  repo: string;
  author: string | null;
  state: CodePrState;
  draft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  openedAt: string;
  firstReviewAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
  mergedBy: string | null;
  reviewCount: number;
  cycleTimeSeconds: number | null;
}

export interface CodePrListResponse {
  items: CodePrRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CodeQuality {
  mergedPrs: number;
  revertOrHotfixFollowupCount: number;
  revertOrHotfixFollowupRate: number;
  hotfixWindowHours: number;
}

export interface AgentRun {
  id: string;
  agentName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  trigger: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: string;
  errorMessage: string | null;
  steps?: AgentStep[];
}

export interface AgentStep {
  id: string;
  runId: string;
  stepIndex: number;
  toolName: string | null;
  stepName: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  modelUsed: string | null;
  costUsd: string;
  errorMessage: string | null;
}

export interface AgentRunsResponse {
  items: AgentRun[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface DashboardStats {
  totalToday: number;
  activeCount: number;
  recentFailed: number;
  avgLatencyMs: number;
}

export interface TimelinePoint {
  day: string;
  status: string;
  count: string;
}

export interface CostSummary {
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  callCount: number;
}

export interface CostByModel {
  provider: string;
  model: string;
  totalCostUsd: string;
  totalTokens: string;
  callCount: string;
}

export interface CostByAgent {
  agentName: string;
  totalCostUsd: string;
  totalTokens: string;
  runCount: string;
}

export interface CostTrendPoint {
  day: string;
  totalCostUsd: string;
  totalTokens: string;
}

export interface TopRun {
  runId: string;
  agentName: string;
  totalCostUsd: string;
  totalTokens: string;
}

export interface CostBudget {
  id: string;
  agentName: string | null;
  dailyLimitUsd: string | null;
  monthlyLimitUsd: string | null;
  alertThresholdPercent: number;
  isActive: boolean;
}

export interface BudgetStatus {
  budget: CostBudget;
  daySpend: number;
  monthSpend: number;
  dayPercent: number | null;
  monthPercent: number | null;
  dayAlert: boolean;
  monthAlert: boolean;
}

export interface ProjectedSpend {
  monthToDate: number;
  dailyRate: number;
  projected: number;
  daysElapsed: number;
  daysInMonth: number;
}

export interface ResourceSnapshot {
  id: string;
  runId: string | null;
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  diskIoReadMb: number;
  diskIoWriteMb: number;
  networkInMb: number;
  networkOutMb: number;
  activeConnections: number;
  recordedAt: string;
}

export interface MetricsHistory {
  time: string;
  avgCpu: string;
  avgMemoryMb: string;
  avgMemoryPercent: string;
  maxCpu: string;
  maxMemoryMb: string;
}

export interface AgentMetrics {
  agentName: string;
  avgCpu: string;
  avgMemoryMb: string;
  peakCpu: string;
  peakMemoryMb: string;
}

export interface AgentLog {
  id: string;
  runId: string;
  stepId: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface LogsResponse {
  items: AgentLog[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  type: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}
