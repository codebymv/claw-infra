import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { MetricsService } from './metrics.service';

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
  constructor(private readonly metricsService: MetricsService) {}

  @Post()
  ingest(@Body() dto: IngestSnapshotDto) {
    return this.metricsService.ingest(dto);
  }
}
