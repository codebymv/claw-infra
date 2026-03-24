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
  searchCards: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<AgentLinkableCard[]>(`/agents/cards/search${qs}`);
  },
  linkCard: (id: string, cardId: string | null) =>
    api.patch<AgentRun>(`/agents/${id}/link-card`, cardId ? { cardId } : {}),
  getSteps: (id: string) => api.get<AgentStep[]>(`/agents/${id}/steps`),
  getStats: () => api.get<DashboardStats>('/agents/stats'),
  getTimeline: (days?: number) => api.get<TimelinePoint[]>(`/agents/timeline?days=${days || 7}`),
  getActive: () => api.get<AgentRun[]>('/agents/active'),
  cancel: (id: string) => api.delete(`/agents/${id}/cancel`),
  getProjectRuns: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<AgentRun[]>(`/agents/projects/${projectId}/runs${qs}`);
  },
  getCardRuns: (cardId: string) => api.get<AgentRun[]>(`/agents/cards/${cardId}/runs`),
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

// --- Projects ---
export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  getById: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (data: CreateProjectRequest) => api.post<Project>('/projects', data),
  update: (id: string, data: UpdateProjectRequest) => api.patch<Project>(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  archive: (id: string) => api.patch<Project>(`/projects/${id}/archive`, {}),
  
  // Kanban Board Management
  getBoard: (projectId: string) => api.get<KanbanBoard>(`/projects/${projectId}/kanban`),
  updateBoard: (projectId: string, data: UpdateBoardRequest) => api.patch<KanbanBoard>(`/projects/${projectId}/kanban`, data),
  
  // Column Management
  createColumn: (projectId: string, data: CreateColumnRequest) => api.post<Column>(`/projects/${projectId}/kanban/columns`, data),
  updateColumn: (projectId: string, columnId: string, data: UpdateColumnRequest) => 
    api.patch<Column>(`/projects/${projectId}/kanban/columns/${columnId}`, data),
  deleteColumn: (projectId: string, columnId: string) => api.delete(`/projects/${projectId}/kanban/columns/${columnId}`),
  reorderColumns: (projectId: string, data: ReorderColumnsRequest) => 
    api.patch(`/projects/${projectId}/kanban/columns/reorder`, data),
  
  // Card Management
  getCards: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<Card[]>(`/projects/${projectId}/cards${qs}`);
  },
  getCard: (projectId: string, cardId: string) => api.get<Card>(`/projects/${projectId}/cards/${cardId}`),
  createCard: (projectId: string, data: CreateCardRequest) => api.post<Card>(`/projects/${projectId}/cards`, data),
  updateCard: (projectId: string, cardId: string, data: UpdateCardRequest) => 
    api.patch<Card>(`/projects/${projectId}/cards/${cardId}`, data),
  deleteCard: (projectId: string, cardId: string) => api.delete(`/projects/${projectId}/cards/${cardId}`),
  moveCard: (projectId: string, cardId: string, data: MoveCardRequest) => 
    api.patch<Card>(`/projects/${projectId}/cards/${cardId}/move`, data),
  bulkUpdateCards: (projectId: string, data: BulkUpdateCardsRequest) => 
    api.patch<Card[]>(`/projects/${projectId}/cards/bulk`, data),
  
  // Comments
  getComments: (projectId: string, cardId: string) => 
    api.get<Comment[]>(`/projects/${projectId}/cards/${cardId}/comments`),
  createComment: (projectId: string, cardId: string, data: CreateCommentRequest) => 
    api.post<Comment>(`/projects/${projectId}/cards/${cardId}/comments`, data),
  updateComment: (projectId: string, cardId: string, commentId: string, data: UpdateCommentRequest) => 
    api.patch<Comment>(`/projects/${projectId}/cards/${cardId}/comments/${commentId}`, data),
  deleteComment: (projectId: string, cardId: string, commentId: string) => 
    api.delete(`/projects/${projectId}/cards/${cardId}/comments/${commentId}`),
  
  // Search
  searchCards: (projectId: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return api.get<SearchResponse<Card>>(`/projects/${projectId}/search/cards?${qs}`);
  },
  searchComments: (projectId: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return api.get<SearchResponse<Comment>>(`/projects/${projectId}/search/comments?${qs}`);
  },
  searchAll: (projectId: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return api.get<SearchResponse>(`/projects/${projectId}/search/all?${qs}`);
  },
  autocomplete: (projectId: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return api.get<{ query: string; results: AutocompleteResult[] }>(`/projects/${projectId}/search/autocomplete?${qs}`);
  },
  
  // Analytics
  getInsights: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<ProjectInsights>(`/projects/${projectId}/analytics/insights${qs}`);
  },
  getVelocity: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<VelocityMetrics>(`/projects/${projectId}/analytics/velocity${qs}`);
  },
  getProductivity: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<TeamProductivityMetrics>(`/projects/${projectId}/analytics/productivity${qs}`);
  },
  getDistributions: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{
      status: Record<string, number>;
      priority: Record<string, number>;
      type: Record<string, number>;
    }>(`/projects/${projectId}/analytics/distributions${qs}`);
  },
  getTrends: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{
      cardCreationTrend: Array<{ date: string; count: number }>;
      completionTrend: Array<{ date: string; count: number }>;
      velocityTrend: Array<{ date: string; velocity: number }>;
    }>(`/projects/${projectId}/analytics/trends${qs}`);
  },
  exportAnalytics: (projectId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ format: string; data: any; filename: string }>(`/projects/${projectId}/analytics/export${qs}`);
  },

  // Linked Repos
  getLinkedRepos: (projectId: string) => api.get<LinkedRepo[]>(`/projects/${projectId}/repos`),
  linkRepo: (projectId: string, repoFullName: string) =>
    api.post<LinkedRepo[]>(`/projects/${projectId}/repos`, { repoFullName }),
  unlinkRepo: (projectId: string, repoId: string) =>
    api.delete(`/projects/${projectId}/repos/${repoId}`),
  getActivity: (projectId: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return api.get<ProjectCodeActivity>(`/projects/${projectId}/activity${qs}`);
  },
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

// --- GitHub App ---
export interface GithubStatus {
  configured: boolean;
  installUrl: string | null;
}

export interface GithubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  isActive: boolean;
  createdAt: string;
  repoGrants?: GithubRepoGrantEntry[];
}

export interface GithubRepoGrantEntry {
  id: string;
  repoFullName: string;
  isActive: boolean;
  createdAt: string;
}

export interface GithubAccessibleRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
}

export const githubApi = {
  getStatus: () => api.get<GithubStatus>('/github/status'),
  listInstallations: () => api.get<GithubInstallation[]>('/github/installations'),
  disconnect: (id: string) => api.delete<void>(`/github/installations/${id}`),
  listRepos: () => api.get<GithubAccessibleRepo[]>('/github/repos'),
  listGrantedRepos: () => api.get<GithubRepoGrantEntry[]>('/github/repos/granted'),
  grantRepo: (installationId: string, repoFullName: string) =>
    api.post<GithubRepoGrantEntry>('/github/repos/grant', { installationId, repoFullName }),
  revokeGrant: (grantId: string) => api.delete<void>(`/github/repos/grant/${grantId}`),
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
  linkedCardId?: string | null;
  linkedCard?: AgentRunLinkedCard | null;
  steps?: AgentStep[];
}

export interface AgentLinkableCard {
  id: string;
  title: string;
  status: CardStatus;
  columnId: string;
  boardId: string;
  columnName: string | null;
  boardName: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface AgentRunLinkedCard {
  id: string;
  title: string;
  status: CardStatus;
  columnId: string;
  boardId: string;
  column?: {
    id: string;
    name: string;
  };
  board?: {
    id: string;
    name: string;
    projectId: string;
    project?: {
      id: string;
      name: string;
    };
  };
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

// --- Projects Types ---
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, any>;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  board?: KanbanBoard;
  members?: ProjectMember[];
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  user?: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface KanbanBoard {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  columns?: Column[];
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  description: string | null;
  position: number;
  wipLimit: number | null;
  rules: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  cards?: Card[];
}

export type CardStatus = 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type CardPriority = 'urgent' | 'high' | 'medium' | 'low';
export type CardType = 'task' | 'feature' | 'bug' | 'epic' | 'story';

export interface Card {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  status: CardStatus;
  priority: CardPriority;
  type: CardType;
  tags: string[];
  customFields: Record<string, any>;
  position: number;
  assigneeId: string | null;
  reporterId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  reporter?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  comments?: Comment[];
}

export interface Comment {
  id: string;
  cardId: string;
  authorId: string;
  content: string;
  mentions: string[];
  parentId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  replies?: Comment[];
}

// Request/Response Types
export interface CreateProjectRequest {
  name: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface CreateColumnRequest {
  name: string;
  description?: string;
  position?: number;
  wipLimit?: number;
  rules?: Record<string, any>;
}

export interface UpdateColumnRequest {
  name?: string;
  description?: string;
  wipLimit?: number;
  rules?: Record<string, any>;
}

export interface ReorderColumnsRequest {
  columnIds: string[];
}

export interface CreateCardRequest {
  columnId: string;
  title: string;
  description?: string;
  priority?: CardPriority;
  type?: CardType;
  tags?: string[];
  customFields?: Record<string, any>;
  assigneeId?: string;
  dueDate?: string;
}

export interface UpdateCardRequest {
  title?: string;
  description?: string;
  priority?: CardPriority;
  type?: CardType;
  tags?: string[];
  customFields?: Record<string, any>;
  assigneeId?: string;
  dueDate?: string;
}

export interface MoveCardRequest {
  columnId: string;
  position: number;
}

export interface BulkUpdateCardsRequest {
  cardIds: string[];
  updates: Partial<UpdateCardRequest>;
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string;
}

export interface UpdateCommentRequest {
  content: string;
}

// Search Types
export interface SearchResponse<T = any> {
  results: SearchResult<T>[];
  total: number;
  query: string;
  executionTime: number;
  facets: {
    types: Record<string, number>;
    statuses: Record<string, number>;
    priorities: Record<string, number>;
    assignees: Record<string, number>;
    tags: Record<string, number>;
  };
  suggestions: string[];
}

export interface SearchResult<T = any> {
  item: T;
  type: 'card' | 'comment' | 'project' | 'board';
  relevance: number;
  highlights: string[];
  context?: Record<string, any>;
}

export interface AutocompleteResult {
  text: string;
  type: 'card' | 'user' | 'tag' | 'project';
  id?: string;
  context?: string;
}

// Analytics Types
export interface VelocityMetrics {
  completedCards: number;
  averageCompletionTime: number;
  throughput: number;
  cycleTime: number;
  leadTime: number;
  burndownData: Array<{
    date: string;
    remaining: number;
    completed: number;
    total: number;
  }>;
}

export interface TeamProductivityMetrics {
  totalCards: number;
  completedCards: number;
  completionRate: number;
  averageCardsPerUser: number;
  topPerformers: Array<{
    userId: string;
    username: string;
    completedCards: number;
    averageCompletionTime: number;
  }>;
  collaborationScore: number;
}

export interface ProjectInsights {
  projectId: string;
  projectName: string;
  timeRange: {
    startDate: string;
    endDate: string;
  };
  velocity: VelocityMetrics;
  productivity: TeamProductivityMetrics;
  statusDistribution: Record<CardStatus, number>;
  priorityDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  columnMetrics: Array<{
    columnId: string;
    columnName: string;
    cardCount: number;
    averageTimeInColumn: number;
    bottleneckScore: number;
  }>;
  trends: {
    cardCreationTrend: Array<{ date: string; count: number }>;
    completionTrend: Array<{ date: string; count: number }>;
    velocityTrend: Array<{ date: string; velocity: number }>;
  };
  recommendations: string[];
}

export interface LinkedRepo {
  id: string;
  provider: string;
  owner: string;
  name: string;
  isActive: boolean;
  defaultBranch: string;
}

export interface ProjectCodeActivity {
  commits: Array<{
    id: string;
    sha: string;
    message: string;
    author: string;
    committedAt: string;
    additions: number;
    deletions: number;
    filesChanged: number;
  }>;
  prs: Array<{
    id: string;
    number: number;
    title: string;
    author: string;
    state: 'open' | 'closed' | 'merged';
    openedAt: string;
    mergedAt: string | null;
    additions: number;
    deletions: number;
    changedFiles: number;
  }>;
}
