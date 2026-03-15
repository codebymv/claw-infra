import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiKeyGuard, RequireApiKeyType } from '../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../common/guards/api-key-rate-limit.guard';
import { ApiKeyType } from '../database/entities/api-key.entity';
import { CostsService } from './costs.service';
import { IdempotencyService } from '../common/services/idempotency.service';

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
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
@RequireApiKeyType(ApiKeyType.AGENT)
@Throttle({ ingest: { ttl: 60000, limit: 30 } })
export class CostIngestController {
  private readonly logger = new Logger(CostIngestController.name);

  constructor(
    private readonly costsService: CostsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async ingest(@Body() dto: IngestCostDto) {
    // Generate idempotency key from request content
    const idempotencyData = {
      runId: dto.runId,
      provider: dto.provider,
      model: dto.model,
      tokensIn: dto.tokensIn,
      tokensOut: dto.tokensOut,
      recordedAt: dto.recordedAt || new Date().toISOString(),
    };

    const idempotencyKey = this.idempotencyService.generateKey(idempotencyData);

    // Check if this request has already been processed
    const isDuplicate =
      await this.idempotencyService.checkAndMark(idempotencyKey);

    if (isDuplicate) {
      this.logger.log(
        `Duplicate cost record detected, returning success without creating: ${idempotencyKey.substring(0, 16)}...`,
      );
      // Return success without creating duplicate record
      return { message: 'Cost record already processed', idempotencyKey };
    }

    // Process the request
    const created = await this.costsService.ingest(dto);
    return created;
  }
}
