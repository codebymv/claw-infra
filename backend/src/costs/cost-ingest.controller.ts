import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { CostsService } from './costs.service';

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
  tokensIn: number;

  @IsNumber()
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
  constructor(private readonly costsService: CostsService) {}

  @Post()
  ingest(@Body() dto: IngestCostDto) {
    return this.costsService.ingest(dto);
  }
}
