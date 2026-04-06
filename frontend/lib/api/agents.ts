import { api } from './client';
import type { AgentRun, AgentRunsResponse, AgentStep, DashboardStats, TimelinePoint, AgentLinkableCard } from './types';

class AgentsApi {
  async list(params?: Record<string, string>): Promise<AgentRunsResponse> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/agents${qs}`);
  }

  async getById(id: string): Promise<AgentRun> {
    return api.get(`/agents/${id}`);
  }

  async searchCards(params?: Record<string, string>): Promise<AgentLinkableCard[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/agents/cards/search${qs}`);
  }

  async linkCard(id: string, cardId: string | null): Promise<AgentRun> {
    return api.patch(`/agents/${id}/link-card`, cardId ? { cardId } : {});
  }

  async getSteps(id: string): Promise<AgentStep[]> {
    return api.get(`/agents/${id}/steps`);
  }

  async getStats(): Promise<DashboardStats> {
    return api.get('/agents/stats');
  }

  async getTimeline(days?: number): Promise<TimelinePoint[]> {
    return api.get(`/agents/timeline?days=${days || 7}`);
  }

  async getActive(): Promise<AgentRun[]> {
    return api.get('/agents/active');
  }

  async cancel(id: string): Promise<void> {
    return api.delete(`/agents/${id}/cancel`);
  }

  async getProjectRuns(projectId: string, params?: Record<string, string>): Promise<AgentRun[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/agents/projects/${projectId}/runs${qs}`);
  }

  async getCardRuns(cardId: string): Promise<AgentRun[]> {
    return api.get(`/agents/cards/${cardId}/runs`);
  }
}

export const agentsApi = new AgentsApi();