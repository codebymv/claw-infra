import { api } from './client';
import type { CodeOverview, CodeTrendPoint, CodePrListResponse, CodeQuality, CodeBackfillResponse } from './types';

class CodeApi {
  async getOverview(params?: Record<string, string>): Promise<CodeOverview> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/code/overview${qs}`);
  }

  async getTrends(params?: Record<string, string>): Promise<CodeTrendPoint[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/code/trends${qs}`);
  }

  async getPrs(params?: Record<string, string>): Promise<CodePrListResponse> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/code/prs${qs}`);
  }

  async getQuality(params?: Record<string, string>): Promise<CodeQuality> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/code/quality${qs}`);
  }

  async triggerBackfill(repo?: string): Promise<CodeBackfillResponse> {
    return api.post('/code/sync/backfill', repo ? { repo } : {});
  }
}

export const codeApi = new CodeApi();