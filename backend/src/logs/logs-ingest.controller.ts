import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsEnum, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { LogsService } from './logs.service';
import { LogLevel } from '../database/entities/agent-log.entity';

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
  constructor(private readonly logsService: LogsService) {}

  @Post()
  ingest(@Body() dto: IngestLogDto) {
    return this.logsService.ingest(dto);
  }

  @Post('batch')
  ingestBatch(@Body() dto: IngestLogBatchDto) {
    return this.logsService.ingestBatch(dto.logs);
  }
}
