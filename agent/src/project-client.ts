interface ProjectApiConfig {
  baseUrl: string;
  apiKey?: string;
  agentId: string;
  agentName: string;
}

// Use built-in fetch (Node.js 18+) or fallback to a simple implementation
const fetch = globalThis.fetch || require('node-fetch');

export class ProjectApiClient {
  private config: ProjectApiConfig;
  private workspaces: Map<string, string> = new Map(); // projectId -> workspaceId

  constructor(config: ProjectApiConfig) {
    this.config = config;
  }

  private async makeRequest<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `claw-agent/${this.config.agentName}`,
      ...headers
    };

    if (this.config.apiKey) {
      requestHeaders['x-agent-token'] = this.config.apiKey;
    }

    // Add agent identification headers
    requestHeaders['X-Agent-ID'] = this.config.agentId;
    requestHeaders['X-Agent-Name'] = this.config.agentName;

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        // @ts-ignore - timeout is supported in node-fetch
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error(`[project-client] Request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  // Workspace Management
  async createWorkspace(projectId: string, maxConcurrentOperations = 5): Promise<string> {
    const existing = this.workspaces.get(projectId);
    if (existing) {
      return existing;
    }

    const response = await this.makeRequest<{ id: string }>(
      `/api/v1/agent/projects/${projectId}/workspace`,
      'POST',
      {
        agentName: this.config.agentName,
        maxConcurrentOperations
      }
    );

    this.workspaces.set(projectId, response.id);
    return response.id;
  }

  async getWorkspace(projectId: string): Promise<any> {
    const workspaceId = this.workspaces.get(projectId);
    if (!workspaceId) {
      throw new Error(`No workspace found for project ${projectId}`);
    }

    return this.makeRequest(`/api/v1/agent/projects/${projectId}/workspace`);
  }

  async terminateWorkspace(projectId: string): Promise<void> {
    const workspaceId = this.workspaces.get(projectId);
    if (!workspaceId) {
      return;
    }

    await this.makeRequest(
      `/api/v1/agent/projects/${projectId}/workspace/${workspaceId}`,
      'DELETE'
    );

    this.workspaces.delete(projectId);
  }

  // Project Management
  async createProject(data: {
    name: string;
    description?: string;
    template?: 'basic' | 'software' | 'marketing';
  }): Promise<any> {
    return this.makeRequest('/api/v1/agent/projects', 'POST', data);
  }

  async listProjects(params: {
    limit?: number;
    status?: 'active' | 'archived';
  } = {}): Promise<any[]> {
    // Use the regular projects endpoint since agent endpoint doesn't have list
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.status) queryParams.set('status', params.status);

    const query = queryParams.toString();
    const endpoint = `/api/projects${query ? `?${query}` : ''}`;
    
    const response = await this.makeRequest(endpoint);
    
    // Handle paginated response - extract items array
    if (response && typeof response === 'object' && Array.isArray(response.items)) {
      return response.items;
    }
    
    // Fallback: if response is already an array, return it
    if (Array.isArray(response)) {
      return response;
    }
    
    // If neither, return empty array
    return [];
  }

  async getProject(projectId: string): Promise<any> {
    return this.makeRequest(`/api/v1/agent/projects/${projectId}`);
  }

  // Board Management
  async createBoard(projectId: string, data: {
    name: string;
    description?: string;
  }): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(`/api/v1/agent/projects/${projectId}/boards`, 'POST', data);
  }

  async listBoards(projectId: string): Promise<any[]> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(`/api/v1/agent/projects/${projectId}/boards`);
  }

  async getBoard(projectId: string, boardId: string): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(`/api/v1/agent/projects/${projectId}/boards/${boardId}`);
  }

  // Card Management
  async createCard(projectId: string, boardId: string, columnId: string, data: {
    title: string;
    description?: string;
    type?: 'task' | 'feature' | 'bug' | 'epic' | 'story';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    tags?: string[];
    dueDate?: string;
  }): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(
      `/api/v1/agent/projects/${projectId}/boards/${boardId}/columns/${columnId}/cards`,
      'POST',
      data
    );
  }

  async listCards(projectId: string, boardId: string, params: {
    columnId?: string;
    status?: string;
    assigneeId?: string;
    priority?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    await this.ensureWorkspace(projectId);
    
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });

    const query = queryParams.toString();
    const endpoint = `/api/v1/agent/projects/${projectId}/boards/${boardId}/cards${query ? `?${query}` : ''}`;
    
    return this.makeRequest(endpoint);
  }

  async getCard(projectId: string, boardId: string, cardId: string): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(`/api/v1/agent/projects/${projectId}/boards/${boardId}/cards/${cardId}`);
  }

  async updateCard(projectId: string, boardId: string, cardId: string, data: {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    status?: 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
    tags?: string[];
    dueDate?: string;
  }): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(
      `/api/v1/agent/projects/${projectId}/boards/${boardId}/cards/${cardId}`,
      'PUT',
      data
    );
  }

  async moveCard(projectId: string, boardId: string, cardId: string, data: {
    targetColumnId: string;
    position?: number;
  }): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(
      `/api/v1/agent/projects/${projectId}/boards/${boardId}/cards/${cardId}/move`,
      'PUT',
      data
    );
  }

  async bulkCardOperation(projectId: string, boardId: string, data: {
    operation: 'move' | 'update' | 'delete';
    cardIds: string[];
    data?: any;
  }): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(
      `/api/v1/agent/projects/${projectId}/boards/${boardId}/cards/bulk`,
      'POST',
      data
    );
  }

  // Comment Management
  async addComment(projectId: string, boardId: string, cardId: string, data: {
    content: string;
    parentId?: string;
  }): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(
      `/api/v1/agent/projects/${projectId}/boards/${boardId}/cards/${cardId}/comments`,
      'POST',
      data
    );
  }

  async listComments(projectId: string, boardId: string, cardId: string, params: {
    limit?: number;
  } = {}): Promise<any[]> {
    await this.ensureWorkspace(projectId);
    
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    const endpoint = `/api/v1/agent/projects/${projectId}/boards/${boardId}/cards/${cardId}/comments${query ? `?${query}` : ''}`;
    
    return this.makeRequest(endpoint);
  }

  // Search and Analytics
  async searchCards(projectId: string, params: {
    q: string;
    boardId?: string;
    columnId?: string;
    status?: string;
    priority?: string;
    limit?: number;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });

    const query = queryParams.toString();
    const endpoint = `/api/projects/${projectId}/search/cards?${query}`;
    
    return this.makeRequest(endpoint);
  }

  async getProjectAnalytics(projectId: string, timeRange: '7d' | '30d' | '90d' = '30d'): Promise<any> {
    return this.makeRequest(`/api/projects/${projectId}/analytics/insights?timeRange=${timeRange}`);
  }

  async getProjectHealth(projectId: string): Promise<any> {
    return this.makeRequest(`/api/v1/agent/projects/${projectId}/health`);
  }

  // Batch Operations
  async batchOperation(projectId: string, operations: Array<{
    type: 'create' | 'update' | 'delete' | 'move';
    resourceType: 'card' | 'board' | 'column' | 'comment';
    resourceId?: string;
    data?: any;
    priority?: number;
  }>): Promise<any> {
    await this.ensureWorkspace(projectId);
    return this.makeRequest(
      `/api/v1/agent/projects/${projectId}/batch`,
      'POST',
      { operations }
    );
  }

  // Helper Methods
  private async ensureWorkspace(projectId: string): Promise<string> {
    if (!this.workspaces.has(projectId)) {
      await this.createWorkspace(projectId);
    }
    return this.workspaces.get(projectId)!;
  }

  // Natural Language Helpers
  async findProjectByName(name: string): Promise<any | null> {
    const projects = await this.listProjects();
    return projects.find(p => 
      p.name.toLowerCase().includes(name.toLowerCase()) ||
      p.slug.toLowerCase().includes(name.toLowerCase())
    ) || null;
  }

  async findBoardByName(projectId: string, name: string): Promise<any | null> {
    const boards = await this.listBoards(projectId);
    return boards.find(b => 
      b.name.toLowerCase().includes(name.toLowerCase())
    ) || null;
  }

  async findCardByTitle(projectId: string, boardId: string, title: string): Promise<any | null> {
    const cards = await this.listCards(projectId, boardId);
    return cards.find(c => 
      c.title.toLowerCase().includes(title.toLowerCase())
    ) || null;
  }

  async findColumnByName(projectId: string, boardId: string, name: string): Promise<any | null> {
    const board = await this.getBoard(projectId, boardId);
    if (!board.columns) return null;
    
    return board.columns.find((col: any) => 
      col.name.toLowerCase().includes(name.toLowerCase()) ||
      col.name.toLowerCase() === name.toLowerCase()
    ) || null;
  }

  // Cleanup
  async cleanup(): Promise<void> {
    const projectIds = Array.from(this.workspaces.keys());
    await Promise.all(
      projectIds.map(projectId => this.terminateWorkspace(projectId).catch(console.error))
    );
    this.workspaces.clear();
  }
}

// Global client instance
let globalClient: ProjectApiClient | null = null;

export function getProjectClient(): ProjectApiClient {
  if (!globalClient) {
    const config: ProjectApiConfig = {
      baseUrl: process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000',
      apiKey: process.env.AGENT_API_KEY || process.env.CLAW_API_KEY,
      agentId: process.env.ZEROCLAW_AGENT_ID || 'agent-' + Math.random().toString(36).substring(2, 11),
      agentName: process.env.ZEROCLAW_AGENT_NAME || 'zeroclaw-primary'
    };

    globalClient = new ProjectApiClient(config);
  }

  return globalClient;
}

export function cleanupProjectClient(): Promise<void> {
  if (globalClient) {
    return globalClient.cleanup();
  }
  return Promise.resolve();
}