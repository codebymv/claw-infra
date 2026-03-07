import { Controller, Post, Patch, Body, Param, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsEnum, IsNumber, IsObject, IsDateString } from 'class-validator';
import { Request } from 'express';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { AgentsService } from './agents.service';
import { AgentRunStatus, AgentRunTrigger } from '../database/entities/agent-run.entity';
import { StepStatus } from '../database/entities/agent-step.entity';
import { IdempotencyService } from '../common/idempotency.service';

class IngestRunDto {
  @IsString()
  agentName: string;

  @IsOptional()
  @IsEnum(AgentRunTrigger)
  trigger?: AgentRunTrigger;

  @IsOptional()
  @IsObject()
  configSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  parentRunId?: string;
}

class UpdateRunStatusDto {
  @IsEnum(AgentRunStatus)
  status: AgentRunStatus;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsNumber()
  durationMs?: number;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsNumber()
  totalTokensIn?: number;

  @IsOptional()
  @IsNumber()
  totalTokensOut?: number;

  @IsOptional()
  @IsString()
  totalCostUsd?: string;
}

class IngestStepDto {
  @IsNumber()
  stepIndex: number;

  @IsOptional()
  @IsString()
  toolName?: string;

  @IsOptional()
  @IsString()
  stepName?: string;

  @IsOptional()
  @IsString()
  inputSummary?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class UpdateStepStatusDto {
  @IsEnum(StepStatus)
  status: StepStatus;

  @IsOptional()
  @IsString()
  outputSummary?: string;

  @IsOptional()
  @IsNumber()
  durationMs?: number;

  @IsOptional()
  @IsNumber()
  tokensIn?: number;

  @IsOptional()
  @IsNumber()
  tokensOut?: number;

  @IsOptional()
  @IsString()
  modelUsed?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  costUsd?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

@Controller('ingest')
@UseGuards(ApiKeyGuard)
@RequireApiKeyType(ApiKeyType.AGENT)
@Throttle({ ingest: { ttl: 60000, limit: 30 } })
export class AgentIngestController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('runs')
  async createRun(@Body() dto: IngestRunDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, 'ingest/runs');
    if (replay) return replay;

    const created = await this.agentsService.createRun(dto);
    await this.persist(req, 'ingest/runs', created);
    return created;
  }

  @Post('runs/:id/start')
  async startRun(@Param('id') id: string, @Req() req: Request) {
    const replay = await this.tryReplay(req, `ingest/runs/${id}/start`);
    if (replay) return replay;

    const started = await this.agentsService.startRun(id);
    await this.persist(req, `ingest/runs/${id}/start`, started);
    return started;
  }

  @Patch('runs/:id/status')
  async updateRunStatus(@Param('id') id: string, @Body() dto: UpdateRunStatusDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, `ingest/runs/${id}/status`);
    if (replay) return replay;

    const updated = await this.agentsService.updateRun(id, {
      ...dto,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
    });

    await this.persist(req, `ingest/runs/${id}/status`, updated);
    return updated;
  }

  @Post('runs/:runId/steps')
  async createStep(@Param('runId') runId: string, @Body() dto: IngestStepDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, `ingest/runs/${runId}/steps`);
    if (replay) return replay;

    const created = await this.agentsService.createStep({ runId, ...dto });
    await this.persist(req, `ingest/runs/${runId}/steps`, created);
    return created;
  }

  @Patch('steps/:id/status')
  async updateStepStatus(@Param('id') id: string, @Body() dto: UpdateStepStatusDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, `ingest/steps/${id}/status`);
    if (replay) return replay;

    const updated = await this.agentsService.updateStep(id, dto);
    await this.persist(req, `ingest/steps/${id}/status`, updated);
    return updated;
  }

  private async tryReplay(req: Request, route: string): Promise<unknown | null> {
    if (!this.idempotencyService.isEnabled()) return null;

    const rawKey = this.readIdempotencyKey(req);
    if (!rawKey) {
      throw new BadRequestException('Missing Idempotency-Key header (required when INGEST_IDEMPOTENCY_ENABLED=true)');
    }

    const tokenPrefix = this.readTokenPrefix(req);
    const keyHash = this.idempotencyService.buildKeyHash(rawKey, route, tokenPrefix);
    const cached = await this.idempotencyService.findByHash(keyHash);
    return cached?.responseBody ?? null;
  }

  private async persist(req: Request, route: string, responseBody: unknown): Promise<void> {
    if (!this.idempotencyService.isEnabled()) return;

    const rawKey = this.readIdempotencyKey(req);
    if (!rawKey) return;

    const tokenPrefix = this.readTokenPrefix(req);
    const keyHash = this.idempotencyService.buildKeyHash(rawKey, route, tokenPrefix);

    await this.idempotencyService.persistResponse({
      keyHash,
      route,
      tokenPrefix,
      statusCode: 201,
      responseBody,
    });
  }

  private readIdempotencyKey(req: Request): string | null {
    const header = req.headers['idempotency-key'];
    const value = Array.isArray(header) ? header[0] : header;
    return value?.trim() || null;
  }

  private readTokenPrefix(req: Request): string | null {
    const raw = req.headers['x-agent-token'];
    const token = Array.isArray(raw) ? raw[0] : raw;
    return token ? token.slice(0, 8) : null;
  }
}
