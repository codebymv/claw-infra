import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MetricsService } from './metrics.service';

type Resolution = '1h' | '6h' | '24h' | '7d';

@Controller('metrics')
@UseGuards(AuthGuard('jwt'))
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('latest')
  getLatest() {
    return this.metricsService.getLatest();
  }

  @Get('history')
  getHistory(@Query('resolution') resolution?: Resolution) {
    return this.metricsService.getHistory(resolution || '1h');
  }

  @Get('by-agent')
  getByAgent(@Query('from') from?: string, @Query('to') to?: string) {
    const f = from
      ? new Date(from)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const t = to ? new Date(to) : new Date();
    return this.metricsService.getByAgent(f, t);
  }

  @Get('runs/:runId')
  getRunMetrics(@Param('runId') runId: string) {
    return this.metricsService.getRunMetrics(runId);
  }
}
