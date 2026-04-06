import { api } from './client';
import type { AgentLog, LogsResponse } from './types';

class LogsApi {
  async getRunLogs(runId: string, params?: Record<string, string>): Promise<LogsResponse> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/logs/runs/${runId}${qs}`);
  }

  async getErrors(limit?: number): Promise<AgentLog[]> {
    return api.get(`/logs/errors?limit=${limit || 20}`);
  }
}

export const logsApi = new LogsApi();