import { Controller, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsEnum, IsNumber, IsObject, IsDateString } from 'class-validator';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { AgentsService } from './agents.service';
import { AgentRunStatus, AgentRunTrigger } from '../database/entities/agent-run.entity';
import { StepStatus } from '../database/entities/agent-step.entity';

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
  constructor(private readonly agentsService: AgentsService) {}

  @Post('runs')
  createRun(@Body() dto: IngestRunDto) {
    return this.agentsService.createRun(dto);
  }

  @Post('runs/:id/start')
  startRun(@Param('id') id: string) {
    return this.agentsService.startRun(id);
  }

  @Patch('runs/:id/status')
  updateRunStatus(@Param('id') id: string, @Body() dto: UpdateRunStatusDto) {
    return this.agentsService.updateRun(id, {
      ...dto,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
    });
  }

  @Post('runs/:runId/steps')
  createStep(@Param('runId') runId: string, @Body() dto: IngestStepDto) {
    return this.agentsService.createStep({ runId, ...dto });
  }

  @Patch('steps/:id/status')
  updateStepStatus(@Param('id') id: string, @Body() dto: UpdateStepStatusDto) {
    return this.agentsService.updateStep(id, dto);
  }
}
