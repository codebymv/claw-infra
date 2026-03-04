import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LogsService } from './logs.service';
import { LogLevel } from '../database/entities/agent-log.entity';

@Controller('logs')
@UseGuards(AuthGuard('jwt'))
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('runs/:runId')
  getRunLogs(
    @Param('runId') runId: string,
    @Query('level') level?: LogLevel,
    @Query('stepId') stepId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.logsService.getRunLogs(runId, {
      level,
      stepId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      cursor,
    });
  }

  @Get('errors')
  getRecentErrors(@Query('limit') limit?: string) {
    return this.logsService.getRecentErrors(limit ? parseInt(limit) : 20);
  }
}
