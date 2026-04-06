import { api } from './client';
import type {
  Project,
  ProjectMember,
  KanbanBoard,
  Column,
  Card,
  Comment,
  ProjectInsights,
  SearchResponse,
} from './types';

export type { Project } from './types';

export interface CreateProjectRequest {
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  template?: 'basic' | 'software' | 'marketing';
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  layout?: Record<string, unknown>;
}

export interface CreateColumnRequest {
  name: string;
  description?: string;
  order?: number;
  wipLimit?: number;
  rules?: Array<{ type: string; config: unknown }>;
}

export interface UpdateColumnRequest {
  name?: string;
  description?: string;
  wipLimit?: number;
  rules?: Record<string, unknown>;
}

export interface ReorderColumnsRequest {
  columnIds: string[];
}

export interface CreateCardRequest {
  columnId: string;
  title: string;
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  type?: 'task' | 'feature' | 'bug' | 'epic' | 'story';
  tags?: string[];
  customFields?: Record<string, unknown>;
  assigneeId?: string;
  dueDate?: string;
}

export interface UpdateCardRequest {
  title?: string;
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  type?: 'task' | 'feature' | 'bug' | 'epic' | 'story';
  tags?: string[];
  customFields?: Record<string, unknown>;
  assigneeId?: string;
  dueDate?: string;
}

export interface MoveCardRequest {
  targetColumnId: string;
  position: number;
}

export interface BulkUpdateCardsRequest {
  cardIds: string[];
  operation: 'update' | 'move' | 'delete';
  updateData?: Partial<UpdateCardRequest>;
  targetColumnId?: string;
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface ListCardsQueryDto {
  columnId?: string;
  status?: string;
  priority?: string;
  type?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
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

class ProjectsApi {
  async list(): Promise<Project[]> {
    return api.get('/projects');
  }

  async getById(id: string): Promise<Project> {
    return api.get(`/projects/${id}`);
  }

  async create(data: CreateProjectRequest): Promise<Project> {
    return api.post('/projects', data);
  }

  async update(id: string, data: UpdateProjectRequest): Promise<Project> {
    return api.put(`/projects/${id}`, data);
  }

  async delete(id: string): Promise<void> {
    return api.delete(`/projects/${id}`);
  }

  async archive(id: string): Promise<Project> {
    return api.put(`/projects/${id}/archive`);
  }

  async getBoard(projectId: string): Promise<KanbanBoard> {
    return api.get(`/projects/${projectId}/kanban`);
  }

  async updateBoard(projectId: string, data: UpdateBoardRequest): Promise<KanbanBoard> {
    return api.patch(`/projects/${projectId}/kanban`, data);
  }

  async createColumn(projectId: string, data: CreateColumnRequest): Promise<Column> {
    return api.post(`/projects/${projectId}/kanban/columns`, data);
  }

  async updateColumn(projectId: string, columnId: string, data: UpdateColumnRequest): Promise<Column> {
    return api.patch(`/projects/${projectId}/kanban/columns/${columnId}`, data);
  }

  async deleteColumn(projectId: string, columnId: string): Promise<void> {
    return api.delete(`/projects/${projectId}/kanban/columns/${columnId}`);
  }

  async reorderColumns(projectId: string, data: ReorderColumnsRequest): Promise<void> {
    return api.patch(`/projects/${projectId}/kanban/columns/reorder`, data);
  }

  async getCards(projectId: string, params?: Record<string, string>): Promise<Card[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/projects/${projectId}/cards${qs}`);
  }

  async getCard(projectId: string, cardId: string): Promise<Card> {
    return api.get(`/projects/${projectId}/cards/${cardId}`);
  }

  async createCard(projectId: string, data: CreateCardRequest): Promise<Card> {
    return api.post(`/projects/${projectId}/cards`, data);
  }

  async updateCard(projectId: string, cardId: string, data: UpdateCardRequest): Promise<Card> {
    return api.patch(`/projects/${projectId}/cards/${cardId}`, data);
  }

  async deleteCard(projectId: string, cardId: string): Promise<void> {
    return api.delete(`/projects/${projectId}/cards/${cardId}`);
  }

  async moveCard(projectId: string, cardId: string, data: MoveCardRequest): Promise<Card> {
    return api.patch(`/projects/${projectId}/cards/${cardId}/move`, data);
  }

  async bulkUpdateCards(projectId: string, data: BulkUpdateCardsRequest): Promise<Card[]> {
    return api.patch(`/projects/${projectId}/cards/bulk`, data);
  }

  async getComments(projectId: string, cardId: string): Promise<Comment[]> {
    return api.get(`/projects/${projectId}/cards/${cardId}/comments`);
  }

  async createComment(projectId: string, cardId: string, data: CreateCommentRequest): Promise<Comment> {
    return api.post(`/projects/${projectId}/cards/${cardId}/comments`, data);
  }

  async updateComment(projectId: string, cardId: string, commentId: string, data: UpdateCommentRequest): Promise<Comment> {
    return api.patch(`/projects/${projectId}/cards/${cardId}/comments/${commentId}`, data);
  }

  async deleteComment(projectId: string, cardId: string, commentId: string): Promise<void> {
    return api.delete(`/projects/${projectId}/cards/${cardId}/comments/${commentId}`);
  }

  async addMember(projectId: string, userId: string, role: string): Promise<ProjectMember> {
    return api.post(`/projects/${projectId}/members`, { userId, role });
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    return api.delete(`/projects/${projectId}/members/${userId}`);
  }

  async getLinkedRepos(projectId: string): Promise<LinkedRepo[]> {
    return api.get(`/projects/${projectId}/repos`);
  }

  async linkRepo(projectId: string, repoFullName: string): Promise<LinkedRepo[]> {
    return api.post(`/projects/${projectId}/repos`, { repoFullName });
  }

  async unlinkRepo(projectId: string, repoId: string): Promise<void> {
    return api.delete(`/projects/${projectId}/repos/${repoId}`);
  }

  async getActivity(projectId: string, limit?: number): Promise<ProjectCodeActivity> {
    const qs = limit ? `?limit=${limit}` : '';
    return api.get(`/projects/${projectId}/activity${qs}`);
  }

  async getInsights(projectId: string, params?: { start_date?: string; end_date?: string; timeRange?: string }): Promise<ProjectInsights> {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return api.get(`/projects/${projectId}/insights${query}`);
  }

  async searchCards(projectId: string, params: Record<string, string>): Promise<SearchResponse> {
    const query = '?' + new URLSearchParams(params).toString();
    return api.get(`/projects/${projectId}/search/cards${query}`);
  }
}

export const projectsApi = new ProjectsApi();