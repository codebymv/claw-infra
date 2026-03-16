/**
 * Data models for Telegram bot commands and user context
 */

// ── Command Models ──

export enum CommandCategory {
  PROJECT_MANAGEMENT = 'project-management',
  TASK_MANAGEMENT = 'task-management',
  CONTEXT_MANAGEMENT = 'context-management',
  ANALYTICS = 'analytics',
  HELP = 'help'
}

export interface BotCommandDefinition {
  command: string;
  description: string;
  category?: CommandCategory;
  aliases?: string[];
  requiresContext?: boolean;
}

export interface CommandMetadata {
  syntax: string;
  examples: string[];
  permissions: string[];
  contextRequired: boolean;
}

export interface ParsedCommand {
  command: string;
  args: CommandArguments;
  rawInput: string;
  isSlashCommand: boolean;
  context: UserContext;
}

export interface CommandArguments {
  positional: string[];
  named: Record<string, string>;
  flags: string[];
}

export interface CommandResult {
  success: boolean;
  response: UIResponse;
  error?: CommandError;
  contextUpdate?: Partial<ProjectContext>;
}

export interface CommandError {
  code: string;
  message: string;
  suggestions?: string[];
}

// ── User Context Models ──

export interface UserContext {
  userId: string;
  chatId: string;
  activeProject?: ProjectContext;
  preferences: UserPreferences;
  session: SessionData;
}

export interface ProjectContext {
  projectId: string;
  projectName: string;
  projectSlug: string;
  selectedAt: Date;
  boards: BoardSummary[];
  recentCards: CardSummary[];
  permissions: ProjectPermissions;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notificationsEnabled: boolean;
  defaultTaskPriority: TaskPriority;
  preferredBoardView: 'list' | 'kanban';
}

export interface SessionData {
  lastActivity: Date;
  commandHistory: string[];
  temporaryData: Record<string, any>;
}

// ── Project and Task Models ──

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  boardCount: number;
  cardCount: number;
  lastActivity: Date;
  isSelected: boolean;
  permissions: ProjectPermissions;
}

export interface TaskListItem {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  type: TaskType;
  boardName: string;
  columnName: string;
  assignee?: string;
  dueDate?: Date;
  tags: string[];
}

export interface BoardSummary {
  id: string;
  name: string;
  cardCount: number;
  columns: ColumnSummary[];
}

export interface ColumnSummary {
  id: string;
  name: string;
  cardCount: number;
  position: number;
}

export interface CardSummary {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  boardName: string;
  columnName: string;
  updatedAt: Date;
}

// ── Enums ──

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DRAFT = 'draft'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done'
}

export enum TaskType {
  TASK = 'task',
  BUG = 'bug',
  FEATURE = 'feature',
  EPIC = 'epic'
}

export interface ProjectPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canManage: boolean;
}

// ── UI Response Models ──

export interface UIResponse {
  text: string;
  keyboard?: import('./types').InlineKeyboard;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
}

export interface PaginationOptions {
  page: number;
  limit: number;
  hasMore: boolean;
  filter?: string;
}

export interface TaskListOptions extends PaginationOptions {
  boardName?: string;
  priority?: string;
  status?: string;
}

export interface QuickAction {
  text: string;
  callback: string;
  style?: 'primary' | 'secondary' | 'danger';
}

// ── Callback Models ──

export interface CallbackAction {
  type: string;
  data: Record<string, any>;
  userId: string;
  chatId: string;
}

export interface CallbackResult {
  response?: UIResponse;
  notification?: string;
  updateMessage?: boolean;
}

export type CallbackHandlerFunction = (action: CallbackAction, context: UserContext) => Promise<CallbackResult>;

// ── Error Response Models ──

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    suggestions?: string[];
    retryable: boolean;
  };
  fallbackResponse?: UIResponse;
}