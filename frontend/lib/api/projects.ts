import { api } from '../api';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  settings: {
    defaultColumns: string[];
    workflowRules: Record<string, any>;
    customFields: Array<{
      name: string;
      type: 'text' | 'number' | 'date' | 'select';
      required: boolean;
      options?: string[];
    }>;
  };
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  memberCount?: number;
  cardCount?: number;
  completedCardCount?: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  template?: 'basic' | 'software' | 'marketing' | 'custom';
  settings?: Partial<Project['settings']>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  settings?: Partial<Project['settings']>;
}

export interface ProjectsResponse {
  items: Project[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

class ProjectsApi {
  // Projects
  async getProjects(): Promise<Project[]> {
    const response: ProjectsResponse = await api.get('/projects');
    return response.items;
  }

  async getProject(id: string): Promise<Project> {
    return api.get(`/projects/${id}`);
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    return api.post('/projects', data);
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    return api.put(`/projects/${id}`, data);
  }

  async deleteProject(id: string): Promise<void> {
    return api.delete(`/projects/${id}`);
  }

  async archiveProject(id: string): Promise<Project> {
    return api.put(`/projects/${id}/archive`);
  }

  async unarchiveProject(id: string): Promise<Project> {
    return api.put(`/projects/${id}/unarchive`);
  }
}

export const projectsApi = new ProjectsApi();