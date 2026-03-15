import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ProjectsService } from '../projects.service';
import { KanbanService } from '../kanban.service';
import { CardsService } from '../cards.service';
import { CommentsService } from '../comments.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { ProjectAuthGuard } from '../auth/project-auth.guard';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { AuditLogService } from '../auth/audit-log.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { CreateBoardDto } from '../dto/create-board.dto';
import { CreateCardDto } from '../dto/create-card.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { BulkCardOperationDto } from '../dto/bulk-card-operation.dto';

export class AgentCreateWorkspaceDto {
  agentName: string;
  maxConcurrentOperations?: number;
}

export class AgentBatchOperationDto {
  operations: Array<{
    type: 'create' | 'update' | 'delete' | 'move';
    resourceType: 'card' | 'board' | 'column' | 'comment';
    resourceId?: string;
    data?: any;
    priority?: number;
  }>;
}

import { CardStatus } from '../../database/entities/card.entity';

export class AgentQueryDto {
  limit?: number = 50;
  offset?: number = 0;
  status?: CardStatus;
  assignee?: string;
  labels?: string[];
  search?: string;
}

@Controller('api/v1/agent/projects')
@UseGuards(ThrottlerGuard, ProjectAuthGuard)
export class AgentProjectController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly kanbanService: KanbanService,
    private readonly cardsService: CardsService,
    private readonly commentsService: CommentsService,
    private readonly agentOrchestrator: AgentOrchestratorService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Workspace Management
  @Post(':projectId/workspace')
  async createWorkspace(
    @Param('projectId') projectId: string,
    @Body() dto: AgentCreateWorkspaceDto,
    @Request() req,
  ) {
    const workspace = await this.agentOrchestrator.createWorkspace(
      projectId,
      req.user.id,
      dto.agentName,
      dto.maxConcurrentOperations,
    );

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.workspace.create',
      resource: 'workspace',
      resourceId: workspace.id,
      projectId,
      metadata: { agentName: dto.agentName },
    });

    return workspace;
  }

  @Get(':projectId/workspace')
  async getWorkspace(@Param('projectId') projectId: string, @Request() req) {
    const workspaces = await this.agentOrchestrator.listWorkspaces(
      projectId,
      req.user.id,
    );
    const activeWorkspace = workspaces.find((ws) => ws.status === 'active');

    if (!activeWorkspace) {
      return null;
    }

    return this.agentOrchestrator.getWorkspaceStats(activeWorkspace.id);
  }

  @Delete(':projectId/workspace/:workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateWorkspace(
    @Param('projectId') projectId: string,
    @Param('workspaceId') workspaceId: string,
    @Request() req,
  ) {
    await this.agentOrchestrator.terminateWorkspace(workspaceId, 'api_request');

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.workspace.terminate',
      resource: 'workspace',
      resourceId: workspaceId,
      projectId,
    });
  }

  // Project Operations
  @Post()
  async createProject(@Body() dto: CreateProjectDto, @Request() req) {
    const result = await this.projectsService.createProject(dto, req.user.id);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.project.create',
      resource: 'project',
      resourceId: result.id,
      metadata: { name: dto.name },
    });

    return result;
  }

  @Get(':projectId')
  @UseGuards(ProjectAccessGuard)
  async getProject(@Param('projectId') projectId: string, @Request() req) {
    const result = await this.projectsService.getProjectById(projectId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.project.get',
      resource: 'project',
      resourceId: projectId,
    });

    return result;
  }

  // Board Operations
  @Post(':projectId/boards')
  @UseGuards(ProjectAccessGuard)
  async createBoard(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardDto,
    @Request() req,
  ) {
    const result = await this.kanbanService.createBoard(projectId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.board.create',
      resource: 'board',
      resourceId: result.id,
      projectId,
      metadata: { name: dto.name },
    });

    return result;
  }

  @Get(':projectId/boards')
  @UseGuards(ProjectAccessGuard)
  async getBoards(@Param('projectId') projectId: string, @Request() req) {
    const result = await this.kanbanService.getBoardsByProject(projectId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.board.list',
      resource: 'board',
      resourceId: 'list',
      projectId,
      metadata: { count: result.length },
    });

    return result;
  }

  @Get(':projectId/boards/:boardId')
  @UseGuards(ProjectAccessGuard)
  async getBoard(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Request() req,
  ) {
    const result = await this.kanbanService.getBoardById(boardId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.board.get',
      resource: 'board',
      resourceId: boardId,
      projectId,
    });

    return result;
  }

  // Card Operations
  @Post(':projectId/boards/:boardId/columns/:columnId/cards')
  @UseGuards(ProjectAccessGuard)
  async createCard(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: CreateCardDto,
    @Request() req,
  ) {
    // Set reporter to current agent if not provided
    if (!dto.reporterId) {
      dto.reporterId = req.user.id;
    }

    const result = await this.cardsService.createCard(boardId, columnId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.card.create',
      resource: 'card',
      resourceId: result.id,
      projectId,
      metadata: { title: dto.title, boardId, columnId },
    });

    return result;
  }

  @Get(':projectId/boards/:boardId/cards')
  @UseGuards(ProjectAccessGuard)
  async getCards(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Query() query: AgentQueryDto,
    @Request() req,
  ) {
    const result = await this.cardsService.listCards(boardId, {
      limit: query.limit,
      page: Math.floor((query.offset || 0) / (query.limit || 20)) + 1,
      status: query.status,
      assigneeId: query.assignee,
      search: query.search,
    });

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.card.list',
      resource: 'card',
      resourceId: 'list',
      projectId,
      metadata: { boardId, filters: query, count: result.items.length },
    });

    return result;
  }

  @Get(':projectId/boards/:boardId/cards/:cardId')
  @UseGuards(ProjectAccessGuard)
  async getCard(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Request() req,
  ) {
    const result = await this.cardsService.getCardById(cardId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.card.get',
      resource: 'card',
      resourceId: cardId,
      projectId,
    });

    return result;
  }

  // Batch Operations
  @Post(':projectId/boards/:boardId/cards/bulk')
  @UseGuards(ProjectAccessGuard)
  async bulkCardOperation(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() dto: BulkCardOperationDto,
    @Request() req,
  ) {
    const result = await this.cardsService.bulkOperation(
      boardId,
      dto,
      req.user.id,
    );

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.card.bulk_operation',
      resource: 'card',
      resourceId: 'bulk',
      projectId,
      metadata: { operation: dto.operation, cardIds: dto.cardIds, boardId },
    });

    return result;
  }

  @Post(':projectId/batch')
  @UseGuards(ProjectAccessGuard)
  async batchOperation(
    @Param('projectId') projectId: string,
    @Body() dto: AgentBatchOperationDto,
    @Request() req,
  ) {
    // Get or create workspace for this agent
    const workspaces = await this.agentOrchestrator.listWorkspaces(
      projectId,
      req.user.id,
    );
    let workspace = workspaces.find((ws) => ws.status === 'active');

    if (!workspace) {
      workspace = await this.agentOrchestrator.createWorkspace(
        projectId,
        req.user.id,
        'Agent API',
        10,
      );
    }

    // Queue all operations
    const operations: any[] = [];
    for (const op of dto.operations) {
      const operation = await this.agentOrchestrator.queueOperation(
        workspace.id,
        op.type,
        op.resourceType,
        op.resourceId || 'new',
        op.data || {},
        op.priority || 0,
      );
      operations.push(operation);
    }

    // Execute operations sequentially (in a real implementation, this could be parallel with conflict resolution)
    const results: any[] = [];
    for (const operation of operations) {
      try {
        await this.agentOrchestrator.executeOperation(operation.id);
        results.push({ operationId: operation.id, status: 'completed' });
      } catch (error) {
        results.push({
          operationId: operation.id,
          status: 'failed',
          error: error.message,
        });
      }
    }

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.batch_operation',
      resource: 'batch',
      resourceId: 'batch',
      projectId,
      metadata: {
        operationCount: dto.operations.length,
        workspaceId: workspace.id,
      },
    });

    return {
      workspaceId: workspace.id,
      operations: results,
      summary: {
        total: results.length,
        completed: results.filter((r) => r.status === 'completed').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
    };
  }

  // Comment Operations
  @Post(':projectId/boards/:boardId/cards/:cardId/comments')
  @UseGuards(ProjectAccessGuard)
  async createComment(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: CreateCommentDto,
    @Request() req,
  ) {
    const result = await this.commentsService.createComment(
      cardId,
      dto,
      req.user.id,
    );

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.comment.create',
      resource: 'comment',
      resourceId: result.id,
      projectId,
      metadata: { cardId, contentLength: dto.content.length },
    });

    return result;
  }

  @Get(':projectId/boards/:boardId/cards/:cardId/comments')
  @UseGuards(ProjectAccessGuard)
  async getComments(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Query() query: AgentQueryDto,
    @Request() req,
  ) {
    const result = await this.commentsService.listComments(cardId, {
      limit: query.limit,
      page: Math.floor((query.offset || 0) / (query.limit || 20)) + 1,
    });

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'agent.comment.list',
      resource: 'comment',
      resourceId: 'list',
      projectId,
      metadata: { cardId, count: result.items.length },
    });

    return result;
  }

  // Health and Status
  @Get(':projectId/health')
  @UseGuards(ProjectAccessGuard)
  async getHealth(@Param('projectId') projectId: string, @Request() req) {
    const workspaces = await this.agentOrchestrator.listWorkspaces(
      projectId,
      req.user.id,
    );
    const activeWorkspace = workspaces.find((ws) => ws.status === 'active');

    let workspaceStats: any = null;
    if (activeWorkspace) {
      workspaceStats = await this.agentOrchestrator.getWorkspaceStats(
        activeWorkspace.id,
      );
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      projectId,
      agentId: req.user.id,
      workspace: workspaceStats,
      rateLimits: {
        // These would come from actual rate limiting configuration
        requestsPerMinute: 100,
        requestsPerHour: 1000,
      },
    };
  }
}
