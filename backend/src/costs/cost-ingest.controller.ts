import { Controller, Post, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import type { Request } from 'express';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { CostsService } from './costs.service';
import { IdempotencyService } from '../common/idempotency.service';

class IngestCostDto {
  @IsString()
  runId: string;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsString()
  provider: string;

  @IsString()
  model: string;

  @IsNumber()
  @Min(0)
  tokensIn: number;

  @IsNumber()
  @Min(0)
  tokensOut: number;

  @IsString()
  costUsd: string;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

@Controller('ingest/costs')
@UseGuards(ApiKeyGuard)
@RequireApiKeyType(ApiKeyType.AGENT)
@Throttle({ ingest: { ttl: 60000, limit: 30 } })
export class CostIngestController {
  constructor(
    private readonly costsService: CostsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async ingest(@Body() dto: IngestCostDto, @Req() req: Request) {
    const replay = await this.tryReplay(req, 'ingest/costs');
    if (replay) return replay;

    const created = await this.costsService.ingest(dto);
    await this.persist(req, 'ingest/costs', created);
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
