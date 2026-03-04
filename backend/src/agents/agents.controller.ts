import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, IsEnum, IsNumber, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { AgentsService, ListRunsQuery } from './agents.service';
import { AgentRunStatus, AgentRunTrigger } from '../database/entities/agent-run.entity';

class CreateRunDto {
  @IsString()
  agentName: string;

  @IsOptional()
  @IsEnum(AgentRunTrigger)
  trigger?: AgentRunTrigger;

  @IsOptional()
  @IsObject()
  configSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  parentRunId?: string;
}

class ListRunsQueryDto implements ListRunsQuery {
  @IsOptional()
  status?: AgentRunStatus | AgentRunStatus[];

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsEnum(AgentRunTrigger)
  trigger?: AgentRunTrigger;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string))
  @IsNumber()
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string))
  @IsNumber()
  limit?: number;
}

@Controller('agents')
@UseGuards(AuthGuard('jwt'))
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('stats')
  getDashboardStats() {
    return this.agentsService.getDashboardStats();
  }

  @Get('timeline')
  getRunTimeline(@Query('days') days?: string) {
    return this.agentsService.getRunTimeline(days ? parseInt(days) : 7);
  }

  @Get('active')
  getActiveRuns() {
    return this.agentsService.getActiveRuns();
  }

  @Get()
  listRuns(@Query() query: ListRunsQueryDto) {
    return this.agentsService.listRuns(query);
  }

  @Post()
  createRun(@Body() dto: CreateRunDto) {
    return this.agentsService.createRun(dto);
  }

  @Get(':id')
  getRunById(@Param('id') id: string) {
    return this.agentsService.getRunById(id);
  }

  @Get(':id/steps')
  getRunSteps(@Param('id') id: string) {
    return this.agentsService.getRunSteps(id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  startRun(@Param('id') id: string) {
    return this.agentsService.startRun(id);
  }

  @Delete(':id/cancel')
  cancelRun(@Param('id') id: string) {
    return this.agentsService.cancelRun(id);
  }
}
