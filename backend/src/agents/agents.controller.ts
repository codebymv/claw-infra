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
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AgentsService, ListRunsQuery } from './agents.service';
import {
  AgentRunStatus,
  AgentRunTrigger,
} from '../database/entities/agent-run.entity';

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

  @IsOptional()
  @IsString()
  linkedCardId?: string;
}

class LinkRunCardDto {
  @IsOptional()
  @IsString()
  cardId?: string;
}

class SearchCardsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : parseInt(value as string, 10),
  )
  @IsNumber()
  limit?: number;
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
  linkedCardId?: string;

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

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
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

  @Get('cards/search')
  searchCards(@Query() query: SearchCardsQueryDto) {
    return this.agentsService.searchCardsForLinking({
      query: query.q,
      projectId: query.projectId,
      limit: query.limit,
    });
  }

  @Get('projects/:projectId/runs')
  getRunsByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('status') status?: AgentRunStatus,
  ) {
    return this.agentsService.getRunsByProject(projectId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Get('cards/:cardId/runs')
  getRunsByCard(@Param('cardId') cardId: string) {
    return this.agentsService.getRunsByCard(cardId);
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

  @Patch(':id/link-card')
  linkRunToCard(@Param('id') id: string, @Body() dto: LinkRunCardDto) {
    return this.agentsService.linkRunToCard(id, dto.cardId ?? null);
  }

  @Delete(':id/cancel')
  cancelRun(@Param('id') id: string) {
    return this.agentsService.cancelRun(id);
  }
}
