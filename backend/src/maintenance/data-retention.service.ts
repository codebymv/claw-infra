import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentLog } from '../database/entities/agent-log.entity';
import { ResourceSnapshot } from '../database/entities/resource-snapshot.entity';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CodeDailyMetric } from '../database/entities/code-daily-metric.entity';
import { IdempotencyService } from '../common/idempotency.service';

@Injectable()
export class DataRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataRetentionService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(AgentLog)
    private readonly logsRepo: Repository<AgentLog>,
    @InjectRepository(ResourceSnapshot)
    private readonly metricsRepo: Repository<ResourceSnapshot>,
    @InjectRepository(CostRecord)
    private readonly costsRepo: Repository<CostRecord>,
    @InjectRepository(CodeDailyMetric)
    private readonly codeDailyMetricsRepo: Repository<CodeDailyMetric>,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<string>('RETENTION_ENABLED') !== 'false';
    if (!enabled) {
      this.logger.log('Retention jobs disabled (RETENTION_ENABLED=false)');
      return;
    }

    const intervalMinutes = Math.max(
      15,
      parseInt(this.config.get<string>('RETENTION_SWEEP_INTERVAL_MINUTES') || '60', 10),
    );

    const runSweep = () => {
      this.runSweep().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Retention sweep failed: ${message}`);
      });
    };

    this.cleanupTimer = setInterval(runSweep, intervalMinutes * 60 * 1000);
    setTimeout(runSweep, 5000);

    this.logger.log(`Retention jobs scheduled (${intervalMinutes}m interval)`);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private getDays(name: string, defaultDays: number, minDays = 1): number {
    const raw = this.config.get<string>(name);
    const parsed = raw ? parseInt(raw, 10) : defaultDays;
    if (Number.isNaN(parsed) || parsed < minDays) return defaultDays;
    return parsed;
  }

  async runSweep() {
    const logsDays = this.getDays('RETENTION_LOGS_DAYS', 30);
    const metricsRawDays = this.getDays('RETENTION_METRICS_RAW_DAYS', 30);
    const costsDays = this.getDays('RETENTION_COSTS_DAYS', 540, 30);
    const codeDailyDays = this.getDays('RETENTION_CODE_DAILY_DAYS', 730, 90);

    const now = Date.now();
    const logsBefore = new Date(now - logsDays * 24 * 60 * 60 * 1000);
    const metricsBefore = new Date(now - metricsRawDays * 24 * 60 * 60 * 1000);
    const costsBefore = new Date(now - costsDays * 24 * 60 * 60 * 1000);
    const codeDailyBefore = new Date(now - codeDailyDays * 24 * 60 * 60 * 1000);

    const [logsDeleted, metricsDeleted, costsDeleted, codeDailyDeleted, idempotencyDeleted] = await Promise.all([
      this.logsRepo
        .createQueryBuilder()
        .delete()
        .from(AgentLog)
        .where('created_at < :before', { before: logsBefore })
        .execute()
        .then((res) => res.affected || 0),
      this.metricsRepo
        .createQueryBuilder()
        .delete()
        .from(ResourceSnapshot)
        .where('recorded_at < :before', { before: metricsBefore })
        .execute()
        .then((res) => res.affected || 0),
      this.costsRepo
        .createQueryBuilder()
        .delete()
        .from(CostRecord)
        .where('recorded_at < :before', { before: costsBefore })
        .execute()
        .then((res) => res.affected || 0),
      this.codeDailyMetricsRepo
        .createQueryBuilder()
        .delete()
        .from(CodeDailyMetric)
        .where('day < :beforeDate', { beforeDate: codeDailyBefore.toISOString().slice(0, 10) })
        .execute()
        .then((res) => res.affected || 0),
      this.idempotency.pruneExpired(),
    ]);

    await this.downsampleOldMetrics(metricsBefore);

    this.logger.log(
      `Retention sweep complete: logs=${logsDeleted}, metrics=${metricsDeleted}, costs=${costsDeleted}, codeDaily=${codeDailyDeleted}, idempotency=${idempotencyDeleted}`,
    );

    return {
      logsDeleted,
      metricsDeleted,
      costsDeleted,
      codeDailyDeleted,
      idempotencyDeleted,
      cutoffs: {
        logsBefore,
        metricsBefore,
        costsBefore,
        codeDailyBefore: codeDailyBefore.toISOString().slice(0, 10),
      },
    };
  }

  private async downsampleOldMetrics(before: Date): Promise<number> {
    // Placeholder for future rollup table implementation.
    // We keep this hook explicit to satisfy phased rollout requirements.
    this.logger.debug(`Downsampling hook evaluated for metrics older than ${before.toISOString()}`);
    return 0;
  }
}
