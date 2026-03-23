import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindManyOptions,
  Between,
  In,
  QueryDeepPartialEntity,
} from 'typeorm';
import {
  AgentRun,
  AgentRunStatus,
  AgentRunTrigger,
} from '../database/entities/agent-run.entity';
import { AgentStep, StepStatus } from '../database/entities/agent-step.entity';
import { Card } from '../database/entities/card.entity';
import { AppGateway } from '../ws/app.gateway';
import { AlertsService } from '../alerts/alerts.service';

export interface CreateRunDto {
  agentName: string;
  trigger?: AgentRunTrigger;
  configSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  parentRunId?: string;
  linkedCardId?: string;
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
  linkedCardId?: string | null;
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
  linkedCardId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface CardSearchQuery {
  query?: string;
  projectId?: string;
  limit?: number;
}

export interface LinkableCardResult {
  id: string;
  title: string;
  status: string;
  columnId: string;
  boardId: string;
  columnName: string | null;
  boardName: string | null;
  projectId: string | null;
  projectName: string | null;
}

function extractLinkedCardId(metadata?: Record<string, unknown>): string | null {
  if (!metadata) return null;

  const candidates = [metadata.cardId, metadata.taskId];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  AgentRunStatus.COMPLETED,
  AgentRunStatus.FAILED,
  AgentRunStatus.CANCELLED,
]);

const TERMINAL_STEP_STATUSES = new Set<StepStatus>([
  StepStatus.COMPLETED,
  StepStatus.FAILED,
  StepStatus.SKIPPED,
]);

const ALLOWED_RUN_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  [AgentRunStatus.QUEUED]: [AgentRunStatus.RUNNING, AgentRunStatus.CANCELLED],
  [AgentRunStatus.RUNNING]: [
    AgentRunStatus.COMPLETED,
    AgentRunStatus.FAILED,
    AgentRunStatus.CANCELLED,
  ],
  [AgentRunStatus.COMPLETED]: [],
  [AgentRunStatus.FAILED]: [],
  [AgentRunStatus.CANCELLED]: [],
};

const ALLOWED_STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  [StepStatus.PENDING]: [StepStatus.RUNNING, StepStatus.SKIPPED],
  [StepStatus.RUNNING]: [
    StepStatus.COMPLETED,
    StepStatus.FAILED,
    StepStatus.SKIPPED,
  ],
  [StepStatus.COMPLETED]: [],
  [StepStatus.FAILED]: [],
  [StepStatus.SKIPPED]: [],
};

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    @InjectRepository(AgentStep)
    private readonly stepRepo: Repository<AgentStep>,
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    private readonly gateway: AppGateway,
    private readonly alerts: AlertsService,
  ) {}

  async createRun(dto: CreateRunDto): Promise<AgentRun> {
    const linkedCardId = await this.resolveLinkedCardId(
      dto.linkedCardId ?? extractLinkedCardId(dto.metadata),
      Boolean(dto.linkedCardId),
    );

    const run = this.runRepo.create({
      ...dto,
      linkedCardId,
      status: AgentRunStatus.QUEUED,
      startedAt: null,
    });
    const saved = await this.runRepo.save(run);
    const hydrated = await this.getRunById(saved.id);
    this.gateway.broadcastRunUpdate(saved.id, {
      type: 'run.created',
      run: hydrated,
    });
    return hydrated;
  }

  async startRun(id: string): Promise<AgentRun> {
    const run = await this.getRunById(id);

    if (!ALLOWED_RUN_TRANSITIONS[run.status].includes(AgentRunStatus.RUNNING)) {
      throw new BadRequestException(
        `Illegal run transition: ${run.status} -> running`,
      );
    }

    const startedAt = run.startedAt || new Date();
    await this.runRepo.update(id, {
      status: AgentRunStatus.RUNNING,
      startedAt,
      completedAt: null,
      durationMs: null,
      errorMessage: null,
    });

    const updated = await this.getRunById(id);
    this.gateway.broadcastRunUpdate(updated.id, {
      type: 'run.started',
      run: updated,
    });
    return updated;
  }

  async updateRun(id: string, dto: UpdateRunDto): Promise<AgentRun> {
    const existing = await this.getRunById(id);

    if (dto.linkedCardId !== undefined) {
      dto.linkedCardId = await this.resolveLinkedCardId(dto.linkedCardId, true);
    }

    if (
      TERMINAL_RUN_STATUSES.has(existing.status) &&
      dto.status &&
      dto.status !== existing.status
    ) {
      throw new BadRequestException(
        `Run ${id} is terminal (${existing.status}) and cannot transition to ${dto.status}`,
      );
    }

    if (
      dto.status &&
      dto.status !== existing.status &&
      !ALLOWED_RUN_TRANSITIONS[existing.status].includes(dto.status)
    ) {
      throw new BadRequestException(
        `Illegal run transition: ${existing.status} -> ${dto.status}`,
      );
    }

    const nextStatus = dto.status || existing.status;
    const patch: Partial<AgentRun> = { ...dto };

    if (nextStatus === AgentRunStatus.RUNNING) {
      patch.startedAt = existing.startedAt || new Date();
      patch.completedAt = null;
      patch.durationMs = null;
    }

    if (TERMINAL_RUN_STATUSES.has(nextStatus)) {
      const completedAt = dto.completedAt || existing.completedAt || new Date();
      patch.completedAt = completedAt;

      const startedAt = existing.startedAt || patch.startedAt;
      if (startedAt) {
        const computed = completedAt.getTime() - startedAt.getTime();
        if (computed < 0) {
          throw new BadRequestException(
            'completedAt cannot be earlier than startedAt',
          );
        }
        patch.durationMs = dto.durationMs ?? computed;
      } else if (dto.durationMs !== undefined && dto.durationMs < 0) {
        throw new BadRequestException('durationMs cannot be negative');
      }
    } else {
      if (dto.completedAt) {
        throw new BadRequestException(
          'completedAt is only valid for terminal statuses',
        );
      }
      if (dto.durationMs !== undefined && dto.durationMs < 0) {
        throw new BadRequestException('durationMs cannot be negative');
      }
    }

    await this.runRepo.update(id, patch as QueryDeepPartialEntity<AgentRun>);
    const updated = await this.getRunById(id);

    this.gateway.broadcastRunUpdate(updated.id, {
      type: 'run.updated',
      run: updated,
    });

    if (
      existing.status !== AgentRunStatus.FAILED &&
      updated.status === AgentRunStatus.FAILED
    ) {
      this.alerts
        .runFailed(
          updated.agentName,
          updated.id,
          updated.errorMessage || undefined,
        )
        .catch(() => undefined);
    }

    return updated;
  }

  async getRunById(id: string): Promise<AgentRun> {
    const run = await this.runRepo.findOne({
      where: { id },
      relations: [
        'steps',
        'linkedCard',
        'linkedCard.column',
        'linkedCard.board',
        'linkedCard.board.project',
      ],
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    return run;
  }

  async listRuns(query: ListRunsQuery) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build query with eager loading to prevent N+1
    const queryBuilder = this.runRepo
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.steps', 'steps')
      .orderBy('run.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    // Apply filters
    if (query.status) {
      if (Array.isArray(query.status)) {
        queryBuilder.andWhere('run.status IN (:...statuses)', {
          statuses: query.status,
        });
      } else {
        queryBuilder.andWhere('run.status = :status', { status: query.status });
      }
    }

    if (query.agentName) {
      queryBuilder.andWhere('run.agent_name = :agentName', {
        agentName: query.agentName,
      });
    }

    if (query.trigger) {
      queryBuilder.andWhere('run.trigger = :trigger', {
        trigger: query.trigger,
      });
    }

    if (query.linkedCardId) {
      queryBuilder.andWhere('run.linked_card_id = :linkedCardId', {
        linkedCardId: query.linkedCardId,
      });
    }

    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date(0);
      const to = query.to ? new Date(query.to) : new Date();
      queryBuilder.andWhere('run.started_at BETWEEN :from AND :to', {
        from,
        to,
      });
    }

    // Execute with count
    const [items, total] = await queryBuilder.getManyAndCount();

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async cancelRun(id: string): Promise<AgentRun> {
    const run = await this.getRunById(id);
    if (![AgentRunStatus.QUEUED, AgentRunStatus.RUNNING].includes(run.status)) {
      throw new BadRequestException('Run is not in a cancellable state');
    }

    const completedAt = new Date();
    const durationMs = run.startedAt
      ? Math.max(0, completedAt.getTime() - run.startedAt.getTime())
      : null;

    await this.runRepo.update(id, {
      status: AgentRunStatus.CANCELLED,
      completedAt,
      durationMs,
    });

    const updated = await this.getRunById(id);
    this.gateway.broadcastRunUpdate(updated.id, {
      type: 'run.cancelled',
      run: updated,
    });
    return updated;
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
      this.runRepo.count({
        where: { status: In([AgentRunStatus.RUNNING, AgentRunStatus.QUEUED]) },
      }),
      this.runRepo.count({
        where: {
          status: AgentRunStatus.FAILED,
          startedAt: Between(dayAgo, now),
        },
      }),
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
    const run = await this.getRunById(dto.runId);
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      throw new BadRequestException(
        `Cannot create step for terminal run ${run.id} (${run.status})`,
      );
    }

    const step = this.stepRepo.create({
      ...dto,
      status: StepStatus.PENDING,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    });

    const saved = await this.stepRepo.save(step);
    this.gateway.broadcastRunUpdate(run.id, {
      type: 'step.created',
      runId: run.id,
      step: saved,
    });
    return saved;
  }

  async updateStep(id: string, dto: UpdateStepDto): Promise<AgentStep> {
    const step = await this.stepRepo.findOne({ where: { id } });
    if (!step) throw new NotFoundException(`Step ${id} not found`);

    const run = await this.getRunById(step.runId);
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      throw new BadRequestException(
        `Cannot update step for terminal run ${run.id} (${run.status})`,
      );
    }

    if (
      TERMINAL_STEP_STATUSES.has(step.status) &&
      dto.status &&
      dto.status !== step.status
    ) {
      throw new BadRequestException(
        `Step ${id} is terminal (${step.status}) and cannot transition to ${dto.status}`,
      );
    }

    if (
      dto.status &&
      dto.status !== step.status &&
      !ALLOWED_STEP_TRANSITIONS[step.status].includes(dto.status)
    ) {
      throw new BadRequestException(
        `Illegal step transition: ${step.status} -> ${dto.status}`,
      );
    }

    const nextStatus = dto.status || step.status;
    const patch: Partial<AgentStep> = { ...dto };

    if (nextStatus === StepStatus.RUNNING) {
      patch.startedAt = step.startedAt || new Date();
      patch.completedAt = null;
      patch.durationMs = null;
    }

    if (TERMINAL_STEP_STATUSES.has(nextStatus)) {
      const completedAt = dto.completedAt || step.completedAt || new Date();
      patch.completedAt = completedAt;

      const startedAt = step.startedAt || patch.startedAt;
      if (startedAt) {
        const computed = completedAt.getTime() - startedAt.getTime();
        if (computed < 0) {
          throw new BadRequestException(
            'step.completedAt cannot be earlier than step.startedAt',
          );
        }
        patch.durationMs = dto.durationMs ?? computed;
      } else if (dto.durationMs !== undefined && dto.durationMs < 0) {
        throw new BadRequestException('step.durationMs cannot be negative');
      }
    } else {
      if (dto.completedAt) {
        throw new BadRequestException(
          'step.completedAt is only valid for terminal statuses',
        );
      }
      if (dto.durationMs !== undefined && dto.durationMs < 0) {
        throw new BadRequestException('step.durationMs cannot be negative');
      }
    }

    await this.stepRepo.update(id, patch as QueryDeepPartialEntity<AgentStep>);

    const updated = await this.stepRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException(`Step ${id} not found`);

    this.gateway.broadcastRunUpdate(run.id, {
      type: 'step.updated',
      runId: run.id,
      step: updated,
    });
    return updated;
  }

  async getRunSteps(runId: string): Promise<AgentStep[]> {
    return this.stepRepo.find({
      where: { runId },
      order: { stepIndex: 'ASC' },
    });
  }

  async searchCardsForLinking(
    query: CardSearchQuery,
  ): Promise<LinkableCardResult[]> {
    const limit = Math.min(Math.max(query.limit || 8, 1), 25);
    const q = query.query?.trim();

    const qb = this.cardRepo
      .createQueryBuilder('card')
      .leftJoin('card.column', 'column')
      .leftJoin('card.board', 'board')
      .leftJoin('board.project', 'project')
      .select('card.id', 'id')
      .addSelect('card.title', 'title')
      .addSelect('card.status', 'status')
      .addSelect('card.column_id', 'columnId')
      .addSelect('card.board_id', 'boardId')
      .addSelect('column.name', 'columnName')
      .addSelect('board.name', 'boardName')
      .addSelect('board.project_id', 'projectId')
      .addSelect('project.name', 'projectName')
      .orderBy('card.updated_at', 'DESC')
      .take(limit);

    if (q) {
      qb.andWhere('card.title ILIKE :q OR card.id::text ILIKE :q', {
        q: `%${q}%`,
      });
    }

    if (query.projectId) {
      qb.andWhere('board.project_id = :projectId', {
        projectId: query.projectId,
      });
    }

    return qb.getRawMany<LinkableCardResult>();
  }

  async linkRunToCard(id: string, cardId: string | null): Promise<AgentRun> {
    await this.getRunById(id);

    const linkedCardId = await this.resolveLinkedCardId(cardId, true);
    await this.runRepo.update(id, { linkedCardId });

    const updated = await this.getRunById(id);
    this.gateway.broadcastRunUpdate(updated.id, {
      type: 'run.updated',
      run: updated,
    });

    return updated;
  }

  private async resolveLinkedCardId(
    cardId: string | null | undefined,
    strict: boolean,
  ): Promise<string | null> {
    if (cardId === undefined || cardId === null || cardId === '') {
      return null;
    }

    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (card) {
      return card.id;
    }

    if (strict) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    return null;
  }
}
