import { api } from './client';
import type { CostSummary, CostByModel, CostByAgent, CostTrendPoint, TopRun, CostBudget, BudgetStatus, ProjectedSpend } from './types';

class CostsApi {
  async getSummary(params?: Record<string, string>): Promise<CostSummary> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/costs/summary${qs}`);
  }

  async getByModel(params?: Record<string, string>): Promise<CostByModel[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/costs/by-model${qs}`);
  }

  async getByAgent(params?: Record<string, string>): Promise<CostByAgent[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/costs/by-agent${qs}`);
  }

  async getTrend(days?: number): Promise<CostTrendPoint[]> {
    return api.get(`/costs/trend?days=${days || 30}`);
  }

  async getTopRuns(params?: Record<string, string>): Promise<TopRun[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/costs/top-runs${qs}`);
  }

  async getBudgets(): Promise<CostBudget[]> {
    return api.get('/costs/budgets');
  }

  async getBudgetStatus(): Promise<BudgetStatus[]> {
    return api.get('/costs/budgets/status');
  }

  async upsertBudget(data: Partial<CostBudget>): Promise<CostBudget> {
    return api.post('/costs/budgets', data);
  }

  async getProjected(): Promise<ProjectedSpend> {
    return api.get('/costs/projected');
  }
}

export const costsApi = new CostsApi();