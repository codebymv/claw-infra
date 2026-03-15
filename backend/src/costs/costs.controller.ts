import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsOptional, IsString, IsNumber, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { CostsService } from './costs.service';

type Period = '1d' | '7d' | '30d' | 'custom';

class PeriodQueryDto {
  @IsOptional()
  @IsString()
  period?: Period;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

class UpsertBudgetDto {
  @IsOptional()
  @IsString()
  agentName?: string | null;

  @IsOptional()
  @IsString()
  dailyLimitUsd?: string | null;

  @IsOptional()
  @IsString()
  monthlyLimitUsd?: string | null;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  alertThresholdPercent?: number;
}

function resolvePeriod(query: PeriodQueryDto): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  if (query.from) return { from: new Date(query.from), to };
  const msMap: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };
  const days = msMap[query.period || '7d'] || 7;
  return { from: new Date(Date.now() - days * 24 * 60 * 60 * 1000), to };
}

@Controller('costs')
@UseGuards(AuthGuard('jwt'))
export class CostsController {
  constructor(private readonly costsService: CostsService) {}

  @Get('summary')
  getSummary(@Query() query: PeriodQueryDto) {
    const { from, to } = resolvePeriod(query);
    return this.costsService.getSummary(from, to);
  }

  @Get('by-model')
  getCostByModel(@Query() query: PeriodQueryDto) {
    const { from, to } = resolvePeriod(query);
    return this.costsService.getCostByModel(from, to);
  }

  @Get('by-agent')
  getCostByAgent(@Query() query: PeriodQueryDto) {
    const { from, to } = resolvePeriod(query);
    return this.costsService.getCostByAgent(from, to);
  }

  @Get('trend')
  getDailyTrend(@Query('days') days?: string) {
    return this.costsService.getDailyTrend(days ? parseInt(days, 10) : 30);
  }

  @Get('top-runs')
  getTopExpensiveRuns(
    @Query() query: PeriodQueryDto,
    @Query('limit') limit?: string,
  ) {
    const { from, to } = resolvePeriod(query);
    return this.costsService.getTopExpensiveRuns(
      from,
      to,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('budgets')
  getBudgets() {
    return this.costsService.getBudgets();
  }

  @Get('budgets/status')
  async getBudgetStatus() {
    return this.costsService.getBudgetStatus();
  }

  @Post('budgets')
  upsertBudget(@Body() dto: UpsertBudgetDto) {
    return this.costsService.upsertBudget(
      dto.agentName ?? null,
      dto.dailyLimitUsd ?? null,
      dto.monthlyLimitUsd ?? null,
      dto.alertThresholdPercent,
    );
  }

  @Get('projected')
  getProjectedSpend() {
    return this.costsService.getProjectedSpend();
  }
}
