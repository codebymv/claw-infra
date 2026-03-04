import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, In } from 'typeorm';
import { AgentRun, AgentRunStatus, AgentRunTrigger } from '../database/entities/agent-run.entity';
import { AgentStep, StepStatus } from '../database/entities/agent-step.entity';

export interface CreateRunDto {
  agentName: string;
  trigger?: AgentRunTrigger;
  configSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  parentRunId?: string;
}

export interface UpdateRunDto {
  status?: AgentRunStatus;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCostUsd?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateStepDto {
  runId: string;
  stepIndex: number;
  toolName?: string;
  stepName?: string;
  inputSummary?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateStepDto {
  status?: StepStatus;
  completedAt?: Date;
  durationMs?: number;
  outputSummary?: string;
  tokensIn?: number;
  tokensOut?: number;
  modelUsed?: string;
  provider?: string;
  costUsd?: string;
  errorMessage?: string;
}

export interface ListRunsQuery {
  status?: AgentRunStatus | AgentRunStatus[];
  agentName?: string;
  trigger?: AgentRunTrigger;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    @InjectRepository(AgentStep) private readonly stepRepo: Repository<AgentStep>,
  ) {}

  async createRun(dto: CreateRunDto): Promise<AgentRun> {
    const run = this.runRepo.create({
      ...dto,
      status: AgentRunStatus.QUEUED,
      startedAt: null,
    });
    return this.runRepo.save(run);
  }

  async startRun(id: string): Promise<AgentRun> {
    await this.runRepo.update(id, {
      status: AgentRunStatus.RUNNING,
      startedAt: new Date(),
    });
    return this.getRunById(id);
  }

  async updateRun(id: string, dto: UpdateRunDto): Promise<AgentRun> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.runRepo.update(id, dto as any);
    return this.getRunById(id);
  }

  async getRunById(id: string): Promise<AgentRun> {
    const run = await this.runRepo.findOne({
      where: { id },
      relations: ['steps'],
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    return run;
  }

  async listRuns(query: ListRunsQuery) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: FindManyOptions<AgentRun>['where'] = {};

    if (query.status) {
      where.status = Array.isArray(query.status) ? In(query.status) : query.status;
    }
    if (query.agentName) where.agentName = query.agentName;
    if (query.trigger) where.trigger = query.trigger;
    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date(0);
      const to = query.to ? new Date(query.to) : new Date();
      where.startedAt = Between(from, to);
    }

    const [items, total] = await this.runRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async cancelRun(id: string): Promise<AgentRun> {
    const run = await this.getRunById(id);
    if (![AgentRunStatus.QUEUED, AgentRunStatus.RUNNING].includes(run.status)) {
      throw new NotFoundException('Run is not in a cancellable state');
    }
    await this.runRepo.update(id, {
      status: AgentRunStatus.CANCELLED,
      completedAt: new Date(),
    });
    return this.getRunById(id);
  }

  async getActiveRuns(): Promise<AgentRun[]> {
    return this.runRepo.find({
      where: { status: In([AgentRunStatus.RUNNING, AgentRunStatus.QUEUED]) },
      order: { startedAt: 'DESC' },
    });
  }

  async getDashboardStats() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalToday, activeCount, recentFailed] = await Promise.all([
      this.runRepo.count({ where: { startedAt: Between(dayAgo, now) } }),
      this.runRepo.count({ where: { status: In([AgentRunStatus.RUNNING, AgentRunStatus.QUEUED]) } }),
      this.runRepo.count({ where: { status: AgentRunStatus.FAILED, startedAt: Between(dayAgo, now) } }),
    ]);

    const avgLatency = await this.runRepo
      .createQueryBuilder('r')
      .select('AVG(r.duration_ms)', 'avg')
      .where('r.status = :status', { status: AgentRunStatus.COMPLETED })
      .andWhere('r.started_at > :dayAgo', { dayAgo })
      .getRawOne<{ avg: string }>();

    return {
      totalToday,
      activeCount,
      recentFailed,
      avgLatencyMs: avgLatency?.avg ? parseFloat(avgLatency.avg) : 0,
    };
  }

  async getRunTimeline(days = 7) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.runRepo
      .createQueryBuilder('r')
      .select("DATE_TRUNC('day', r.started_at)", 'day')
      .addSelect('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('r.started_at > :from', { from })
      .groupBy("DATE_TRUNC('day', r.started_at)")
      .addGroupBy('r.status')
      .orderBy("DATE_TRUNC('day', r.started_at)", 'ASC')
      .getRawMany();
  }

  async createStep(dto: CreateStepDto): Promise<AgentStep> {
    const step = this.stepRepo.create({
      ...dto,
      status: StepStatus.PENDING,
    });
    return this.stepRepo.save(step);
  }

  async updateStep(id: string, dto: UpdateStepDto): Promise<AgentStep> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.stepRepo.update(id, dto as any);
    const step = await this.stepRepo.findOne({ where: { id } });
    if (!step) throw new NotFoundException(`Step ${id} not found`);
    return step;
  }

  async getRunSteps(runId: string): Promise<AgentStep[]> {
    return this.stepRepo.find({
      where: { runId },
      order: { stepIndex: 'ASC' },
    });
  }
}
