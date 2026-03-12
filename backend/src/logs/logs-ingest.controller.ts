import { Controller, Post, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsEnum, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { LogsService } from './logs.service';
import { LogLevel } from '../database/entities/agent-log.entity';
import { IdempotencyService } from '../common/services/idempotency.service';

class IngestLogDto {
  @IsString()
  runId: string;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsEnum(LogLevel)
  level: LogLevel;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class IngestLogBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestLogDto)
  logs: IngestLogDto[];
}

@Controller('ingest/logs')
@UseGuards(ApiKeyGuard)
@RequireApiKeyType(ApiKeyType.AGENT)
@Throttle({ ingest: { ttl: 60000, limit: 30 } })
export class LogsIngestController {
  constructor(
    private readonly logsService: LogsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async ingest(@Body() dto: IngestLogDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, 'ingest/logs');
    if (replay) return replay;

    const created = await this.logsService.ingest(dto);
    await this.persist(req, 'ingest/logs', created);
    return created;
  }

  @Post('batch')
  async ingestBatch(@Body() dto: IngestLogBatchDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, 'ingest/logs/batch');
    if (replay) return replay;

    if (!dto.logs.length) {
      throw new BadRequestException('logs batch cannot be empty');
    }

    const created = await this.logsService.ingestBatch(dto.logs);
    await this.persist(req, 'ingest/logs/batch', created);
    return created;
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
