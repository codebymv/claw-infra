import { api } from './client';
import type { ResourceSnapshot, MetricsHistory, AgentMetrics } from './types';

class MetricsApi {
  async getLatest(): Promise<ResourceSnapshot | null> {
    return api.get('/metrics/latest');
  }

  async getHistory(resolution?: string): Promise<MetricsHistory[]> {
    return api.get(`/metrics/history?resolution=${resolution || '1h'}`);
  }

  async getByAgent(): Promise<AgentMetrics[]> {
    return api.get('/metrics/by-agent');
  }

  async getRunMetrics(runId: string): Promise<ResourceSnapshot[]> {
    return api.get(`/metrics/runs/${runId}`);
  }
}

export const metricsApi = new MetricsApi();