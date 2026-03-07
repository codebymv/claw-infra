import { Controller, Post, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { Request } from 'express';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { MetricsService } from './metrics.service';
import { IdempotencyService } from '../common/idempotency.service';

class IngestSnapshotDto {
  @IsOptional()
  @IsString()
  runId?: string;

  @IsNumber()
  cpuPercent: number;

  @IsNumber()
  memoryMb: number;

  @IsNumber()
  memoryPercent: number;

  @IsOptional()
  @IsNumber()
  diskIoReadMb?: number;

  @IsOptional()
  @IsNumber()
  diskIoWriteMb?: number;

  @IsOptional()
  @IsNumber()
  networkInMb?: number;

  @IsOptional()
  @IsNumber()
  networkOutMb?: number;

  @IsOptional()
  @IsNumber()
  activeConnections?: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

@Controller('ingest/metrics')
@UseGuards(ApiKeyGuard)
@RequireApiKeyType(ApiKeyType.AGENT)
@Throttle({ ingest: { ttl: 60000, limit: 30 } })
export class MetricsIngestController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async ingest(@Body() dto: IngestSnapshotDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, 'ingest/metrics');
    if (replay) return replay;

    const saved = await this.metricsService.ingest(dto);
    await this.persist(req, 'ingest/metrics', saved);
    return saved;
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
