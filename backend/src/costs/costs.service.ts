// costs.service — budget tracking & spend aggregation
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CostBudget } from '../database/entities/cost-budget.entity';
import { PricingService } from './pricing.service';

export interface IngestCostDto {
  runId: string;
  stepId?: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: string;
  recordedAt?: string;
}

// ZeroClaw sends massive repeating system prompts, resulting in ~90% cache hits on OpenRouter
const ASSUMED_CACHE_HIT_RATE = 0.90;

@Injectable()
export class CostsService {
  private readonly logger = new Logger(CostsService.name);

  // In-memory dedup for a personal/single-instance app:
  // prevent repeating the same threshold alert on every polling call.
  private readonly budgetAlertState = new Map<string, boolean>();

  constructor(
    @InjectRepository(CostRecord) private readonly costRepo: Repository<CostRecord>,
    @InjectRepository(CostBudget) private readonly budgetRepo: Repository<CostBudget>,
    private readonly alerts: AlertsService,
    private readonly pricingService: PricingService,
  ) { }

  async ingest(dto: IngestCostDto): Promise<CostRecord> {
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    let costUsd = parseFloat(dto.costUsd || '0');
    
    if (costUsd === 0 || isNaN(costUsd)) {
      // Get pricing from database
      const pricing = await this.pricingService.getPricing(dto.provider, dto.model, recordedAt);

      const cachedTokensIn = dto.tokensIn * ASSUMED_CACHE_HIT_RATE;
      const uncachedTokensIn = dto.tokensIn * (1 - ASSUMED_CACHE_HIT_RATE);
      const tokensInCost = (uncachedTokensIn * pricing.inputPricePerMillion) + 
                           (cachedTokensIn * (pricing.inputPricePerMillion * pricing.cacheDiscount));

      costUsd = tokensInCost + (dto.tokensOut * pricing.outputPricePerMillion);
    }

    const record = this.costRepo.create({
      ...dto,
      costUsd: costUsd.toFixed(6),
      recordedAt,
    });
    const saved = await this.costRepo.save(record);

    // Trigger budget checks after new cost ingestion instead of read endpoints.
    this.evaluateAndNotifyBudgetThresholds().catch((err: Error) => {
      this.logger.warn(`Budget threshold evaluation failed: ${err.message}`);
    });

    return saved;
  }

  async getSummary(from: Date, to: Date) {
    const result = await this.costRepo
      .createQueryBuilder('c')
      .select('SUM(CAST(c.cost_usd AS DECIMAL))', 'totalCostUsd')
      .addSelect('SUM(c.tokens_in)', 'totalTokensIn')
      .addSelect('SUM(c.tokens_out)', 'totalTokensOut')
      .addSelect('COUNT(*)', 'callCount')
      .where('c.recorded_at BETWEEN :from AND :to', { from, to })
      .getRawOne<{
        totalCostUsd: string;
        totalTokensIn: string;
        totalTokensOut: string;
        callCount: string;
      }>();

    return {
      totalCostUsd: parseFloat(result?.totalCostUsd || '0'),
      totalTokensIn: parseInt(result?.totalTokensIn || '0', 10),
      totalTokensOut: parseInt(result?.totalTokensOut || '0', 10),
      callCount: parseInt(result?.callCount || '0', 10),
    };
  }

  async getCostByModel(from: Date, to: Date) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      // Use materialized views for historical data (older than 24 hours)
      if (to < oneDayAgo) {
        // Query daily summary for old data
        return await this.costRepo.manager.query(`
          SELECT 
            provider,
            model,
            SUM(total_cost_usd) as "totalCostUsd",
            SUM(total_tokens_in + total_tokens_out) as "totalTokens",
            SUM(call_count) as "callCount"
          FROM daily_cost_summary
          WHERE day BETWEEN $1 AND $2
          GROUP BY provider, model
          ORDER BY SUM(total_cost_usd) DESC
        `, [from, to]);
      } else if (from >= oneDayAgo) {
        // Query hourly summary for recent data
        return await this.costRepo.manager.query(`
          SELECT 
            provider,
            model,
            SUM(total_cost_usd) as "totalCostUsd",
            SUM(total_tokens_in + total_tokens_out) as "totalTokens",
            SUM(call_count) as "callCount"
          FROM hourly_cost_summary
          WHERE hour BETWEEN $1 AND $2
          GROUP BY provider, model
          ORDER BY SUM(total_cost_usd) DESC
        `, [from, to]);
      } else {
        // Mixed query - combine both sources
        const historicalData = await this.costRepo.manager.query(`
          SELECT 
            provider,
            model,
            SUM(total_cost_usd) as total_cost_usd,
            SUM(total_tokens_in + total_tokens_out) as total_tokens,
            SUM(call_count) as call_count
          FROM daily_cost_summary
          WHERE day BETWEEN $1 AND $2
          GROUP BY provider, model
        `, [from, oneDayAgo]);

        const recentData = await this.costRepo.manager.query(`
          SELECT 
            provider,
            model,
            SUM(total_cost_usd) as total_cost_usd,
            SUM(total_tokens_in + total_tokens_out) as total_tokens,
            SUM(call_count) as call_count
          FROM hourly_cost_summary
          WHERE hour BETWEEN $1 AND $2
          GROUP BY provider, model
        `, [oneDayAgo, to]);

        // Merge results
        const merged = new Map();
        [...historicalData, ...recentData].forEach(row => {
          const key = `${row.provider}:${row.model}`;
          if (merged.has(key)) {
            const existing = merged.get(key);
            existing.totalCostUsd = parseFloat(existing.totalCostUsd) + parseFloat(row.total_cost_usd);
            existing.totalTokens = parseInt(existing.totalTokens) + parseInt(row.total_tokens);
            existing.callCount = parseInt(existing.callCount) + parseInt(row.call_count);
          } else {
            merged.set(key, {
              provider: row.provider,
              model: row.model,
              totalCostUsd: parseFloat(row.total_cost_usd),
              totalTokens: parseInt(row.total_tokens),
              callCount: parseInt(row.call_count),
            });
          }
        });

        return Array.from(merged.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
      }
    } catch (error) {
      // If materialized views don't exist, fall back to direct cost_records query
      if (error.message.includes('does not exist')) {
        this.logger.warn(`Materialized views not available, falling back to direct query: ${error.message}`);
        return this.getCostByModelFallback(from, to);
      }
      throw error;
    }
  }

  /**
   * Fallback method when materialized views are not available
   */
  private async getCostByModelFallback(from: Date, to: Date) {
    return this.costRepo
      .createQueryBuilder('c')
      .select('c.provider', 'provider')
      .addSelect('c.model', 'model')
      .addSelect('SUM(CAST(c.cost_usd AS DECIMAL))', 'totalCostUsd')
      .addSelect('SUM(c.tokens_in + c.tokens_out)', 'totalTokens')
      .addSelect('COUNT(*)', 'callCount')
      .where('c.recorded_at BETWEEN :from AND :to', { from, to })
      .groupBy('c.provider, c.model')
      .orderBy('SUM(CAST(c.cost_usd AS DECIMAL))', 'DESC')
      .getRawMany();
  }

  async getCostByAgent(from: Date, to: Date) {
    return this.costRepo
      .createQueryBuilder('c')
      .leftJoin('c.run', 'run')
      .select('run.agent_name', 'agentName')
      .addSelect('SUM(CAST(c.cost_usd AS DECIMAL))', 'totalCostUsd')
      .addSelect('SUM(c.tokens_in + c.tokens_out)', 'totalTokens')
      .addSelect('COUNT(DISTINCT c.run_id)', 'runCount')
      .where('c.recorded_at BETWEEN :from AND :to', { from, to })
      .groupBy('run.agent_name')
      .orderBy('SUM(CAST(c.cost_usd AS DECIMAL))', 'DESC')
      .getRawMany();
  }

  async getDailyTrend(days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.costRepo
      .createQueryBuilder('c')
      .select("DATE_TRUNC('day', c.recorded_at)", 'day')
      .addSelect('SUM(CAST(c.cost_usd AS DECIMAL))', 'totalCostUsd')
      .addSelect('SUM(c.tokens_in + c.tokens_out)', 'totalTokens')
      .where('c.recorded_at > :from', { from })
      .groupBy("DATE_TRUNC('day', c.recorded_at)")
      .orderBy("DATE_TRUNC('day', c.recorded_at)", 'ASC')
      .getRawMany();
  }

  async getTopExpensiveRuns(from: Date, to: Date, limit = 10) {
    return this.costRepo
      .createQueryBuilder('c')
      .leftJoin('c.run', 'run')
      .select('c.run_id', 'runId')
      .addSelect('run.agent_name', 'agentName')
      .addSelect('SUM(CAST(c.cost_usd AS DECIMAL))', 'totalCostUsd')
      .addSelect('SUM(c.tokens_in + c.tokens_out)', 'totalTokens')
      .where('c.recorded_at BETWEEN :from AND :to', { from, to })
      .groupBy('c.run_id')
      .addGroupBy('run.agent_name')
      .orderBy('SUM(CAST(c.cost_usd AS DECIMAL))', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  async getBudgets() {
    return this.budgetRepo.find({ where: { isActive: true } });
  }

  async upsertBudget(agentName: string | null, dailyLimitUsd: string | null, monthlyLimitUsd: string | null, alertThresholdPercent = 80) {
    const existing = await this.budgetRepo.findOne({ where: { agentName: agentName ?? undefined } });
    if (existing) {
      await this.budgetRepo.update(existing.id, { dailyLimitUsd, monthlyLimitUsd, alertThresholdPercent });
      return this.budgetRepo.findOne({ where: { id: existing.id } });
    }
    const budget = this.budgetRepo.create({ agentName, dailyLimitUsd, monthlyLimitUsd, alertThresholdPercent });
    return this.budgetRepo.save(budget);
  }

  async getBudgetStatus() {
    return this.computeBudgetStatus();
  }

  async getRunCosts(runId: string) {
    return this.costRepo.find({ where: { runId }, order: { recordedAt: 'ASC' } });
  }

  async notifyBudgetThreshold(agentName: string, spent: number, limit: string): Promise<void> {
    await this.alerts.budgetExceeded(agentName, spent.toFixed(2), limit);
  }

  async getProjectedSpend() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysElapsed = (now.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const spent = await this.costRepo
      .createQueryBuilder('c')
      .select('SUM(CAST(c.cost_usd AS DECIMAL))', 'total')
      .where('c.recorded_at >= :start', { start: monthStart })
      .getRawOne<{ total: string }>();

    const monthSpend = parseFloat(spent?.total || '0');
    const dailyRate = daysElapsed > 0 ? monthSpend / daysElapsed : 0;
    const projected = dailyRate * daysInMonth;

    return {
      monthToDate: monthSpend,
      dailyRate,
      projected,
      daysElapsed: Math.floor(daysElapsed),
      daysInMonth,
    };
  }

  private async evaluateAndNotifyBudgetThresholds(): Promise<void> {
    const status = await this.computeBudgetStatus();

    for (const item of status) {
      const budget = item.budget;
      const agent = budget.agentName || 'global';

      const dayKey = `${agent}:day`;
      const monthKey = `${agent}:month`;

      await this.handleThreshold(dayKey, item.dayAlert, agent, item.daySpend, budget.dailyLimitUsd);
      await this.handleThreshold(monthKey, item.monthAlert, agent, item.monthSpend, budget.monthlyLimitUsd);
    }
  }

  private async handleThreshold(
    key: string,
    isTriggered: boolean,
    agent: string,
    spent: number,
    limit: string | null,
  ): Promise<void> {
    if (!limit) return;

    const wasTriggered = this.budgetAlertState.get(key) ?? false;

    // reset latch when threshold recovers (e.g., new day/month window)
    if (!isTriggered) {
      if (wasTriggered) this.budgetAlertState.set(key, false);
      return;
    }

    // already alerted for this triggered window
    if (wasTriggered) return;

    this.budgetAlertState.set(key, true);
    await this.notifyBudgetThreshold(agent, spent, limit);
  }

  private async computeBudgetStatus() {
    const budgets = await this.getBudgets();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const results = await Promise.all(
      budgets.map(async (budget) => {
        let dayQuery = this.costRepo
          .createQueryBuilder('c')
          .leftJoin('c.run', 'run')
          .select('SUM(CAST(c.cost_usd AS DECIMAL))', 'total')
          .where(`c.recorded_at >= :start`, { start: dayStart });
        if (budget.agentName) {
          dayQuery = dayQuery.andWhere('run.agent_name = :agentName', { agentName: budget.agentName });
        }
        const daySpend = await dayQuery.getRawOne<{ total: string }>();

        let monthQuery = this.costRepo
          .createQueryBuilder('c')
          .leftJoin('c.run', 'run')
          .select('SUM(CAST(c.cost_usd AS DECIMAL))', 'total')
          .where(`c.recorded_at >= :start`, { start: monthStart });
        if (budget.agentName) {
          monthQuery = monthQuery.andWhere('run.agent_name = :agentName', { agentName: budget.agentName });
        }
        const monthSpend = await monthQuery.getRawOne<{ total: string }>();

        const dayTotal = parseFloat(daySpend?.total || '0');
        const monthTotal = parseFloat(monthSpend?.total || '0');
        const dailyLimit = budget.dailyLimitUsd ? parseFloat(budget.dailyLimitUsd) : null;
        const monthlyLimit = budget.monthlyLimitUsd ? parseFloat(budget.monthlyLimitUsd) : null;

        return {
          budget,
          daySpend: dayTotal,
          monthSpend: monthTotal,
          dayPercent: dailyLimit ? (dayTotal / dailyLimit) * 100 : null,
          monthPercent: monthlyLimit ? (monthTotal / monthlyLimit) * 100 : null,
          dayAlert: dailyLimit ? dayTotal / dailyLimit >= budget.alertThresholdPercent / 100 : false,
          monthAlert: monthlyLimit ? monthTotal / monthlyLimit >= budget.alertThresholdPercent / 100 : false,
        };
      }),
    );

    return results;
  }
}
