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
  createdAt: string;
  updatedAt?: string;
}

export interface AgentRunLinkedCard {
  id: string;
  title: string;
  status: CardStatus;
  columnId: string;
  boardId: string;
  column?: { id: string; name: string };
  board?: { id: string; name: string; projectId: string; project?: { id: string; name: string } };
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

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown>;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  board?: KanbanBoard;
  members?: ProjectMember[];
  cardCount?: number;
  completedCardCount?: number;
  boards?: Array<{ id: string; name: string }>;
  memberCount?: number;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  user?: { id: string; email: string; displayName: string | null };
}

export interface KanbanBoard {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
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
  rules: Record<string, unknown>;
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
  customFields: Record<string, unknown>;
  position: number;
  assigneeId: string | null;
  reporterId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; email: string; displayName: string | null };
  reporter?: { id: string; email: string; displayName: string | null };
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
  author?: { id: string; email: string; displayName: string | null };
  replies?: Comment[];
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

export interface GitHubStatus {
  configured: boolean;
  installUrl: string | null;
}

export interface GitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  isActive: boolean;
  createdAt: string;
  repoGrants?: GitHubRepoGrantEntry[];
}

export interface GitHubRepoGrantEntry {
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

export interface SearchResult<T> {
  id: string;
  type: string;
  score: number;
  highlights: string[];
  item: T;
}

export interface SearchResponse {
  results: SearchResult<Card>[];
  total: number;
  executionTime: number;
  facets?: {
    priorities?: Record<string, number>;
    statuses?: Record<string, number>;
    types?: Record<string, number>;
    assignees?: Record<string, number>;
  };
}

export interface AnalyticsTimeRange {
  startDate: string;
  endDate: string;
}

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
  timeRange: AnalyticsTimeRange;
  velocity: VelocityMetrics;
  productivity: TeamProductivityMetrics;
  statusDistribution: Record<string, number>;
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