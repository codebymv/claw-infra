// costs.service — budget tracking & spend aggregation
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CostBudget } from '../database/entities/cost-budget.entity';

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

const PRICING_MAP: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-4-6': { in: 3.0 / 1000000, out: 15.0 / 1000000 },
  'openai/gpt-5.3-codex': { in: 2.0 / 1000000, out: 10.0 / 1000000 },
};

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
  ) { }

  async ingest(dto: IngestCostDto): Promise<CostRecord> {
    let costUsd = parseFloat(dto.costUsd || '0');
    if (costUsd === 0 || isNaN(costUsd)) {
      const pricing = PRICING_MAP[dto.model] || { in: 0, out: 0 };
      costUsd = (dto.tokensIn * pricing.in) + (dto.tokensOut * pricing.out);
    }

    const record = this.costRepo.create({
      ...dto,
      costUsd: costUsd.toFixed(6),
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
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
    return this.costRepo
      .createQueryBuilder('c')
      .select('c.provider', 'provider')
      .addSelect('c.model', 'model')
      .addSelect('SUM(CAST(c.cost_usd AS DECIMAL))', 'totalCostUsd')
      .addSelect('SUM(c.tokens_in + c.tokens_out)', 'totalTokens')
      .addSelect('COUNT(*)', 'callCount')
      .where('c.recorded_at BETWEEN :from AND :to', { from, to })
      .groupBy('c.provider')
      .addGroupBy('c.model')
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
