import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectAuthGuard } from './auth/project-auth.guard';
import {
  ProjectAccessGuard,
  RequireProjectPermission,
} from './auth/project-access.guard';
import { ProjectsService } from './projects.service';
import { KanbanService } from './kanban.service';
import { CardsService } from './cards.service';
import { CommentsService } from './comments.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { ListCardsQueryDto } from './dto/list-cards-query.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AuditLogService } from './auth/audit-log.service';

@Controller('projects')
@UseGuards(ProjectAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly kanbanService: KanbanService,
    private readonly cardsService: CardsService,
    private readonly commentsService: CommentsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async createProject(@Body() dto: CreateProjectDto, @Request() req) {
    const result = await this.projectsService.createProject(dto, req.user.id);

    await this.auditLogService.logProjectAccess(
      req.user.id,
      result.id,
      'create',
      { projectName: result.name },
    );

    return result;
  }

  @Get()
  async listProjects(@Query() query: ListProjectsQueryDto, @Request() req) {
    const result = await this.projectsService.listProjects(query, req.user.id);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'list',
      resource: 'projects',
      resourceId: 'all',
      metadata: { count: result.items.length },
    });

    return result;
  }

  @Get(':id')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getProject(@Param('id') id: string, @Request() req) {
    const result = await this.projectsService.getProjectById(id);

    await this.auditLogService.logProjectAccess(req.user.id, id, 'read');

    return result;
  }

  @Get('slug/:slug')
  async getProjectBySlug(@Param('slug') slug: string, @Request() req) {
    const result = await this.projectsService.getProjectBySlug(slug);

    await this.auditLogService.logProjectAccess(
      req.user.id,
      result.id,
      'read',
      { accessMethod: 'slug' },
    );

    return result;
  }

  @Put(':id')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async updateProject(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Request() req,
  ) {
    const result = await this.projectsService.updateProject(
      id,
      dto,
      req.user.id,
    );

    await this.auditLogService.logProjectAccess(req.user.id, id, 'update', {
      changes: Object.keys(dto),
    });

    return result;
  }

  @Put(':id/archive')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  @HttpCode(HttpStatus.OK)
  async archiveProject(@Param('id') id: string, @Request() req) {
    const result = await this.projectsService.archiveProject(id, req.user.id);

    await this.auditLogService.logProjectAccess(req.user.id, id, 'archive');

    return result;
  }

  @Delete(':id')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProject(@Param('id') id: string, @Request() req) {
    // Only project owner can delete (additional check in service)
    await this.projectsService.deleteProject(id, req.user.id);

    await this.auditLogService.logProjectAccess(req.user.id, id, 'delete');
  }

  @Post(':id/members')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  async addProjectMember(
    @Param('id') projectId: string,
    @Body() body: { userId: string; role: string },
    @Request() req,
  ) {
    const result = await this.projectsService.addProjectMember(
      projectId,
      body.userId,
      body.role as any,
    );

    await this.auditLogService.logProjectAccess(
      req.user.id,
      projectId,
      'add_member',
      { targetUserId: body.userId, role: body.role },
    );

    return result;
  }

  @Delete(':id/members/:userId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeProjectMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    await this.projectsService.removeProjectMember(
      projectId,
      userId,
      req.user.id,
    );

    await this.auditLogService.logProjectAccess(
      req.user.id,
      projectId,
      'remove_member',
      { targetUserId: userId },
    );
  }

  // --- Linked Repos ---

  @Get(':id/repos')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getLinkedRepos(@Param('id') projectId: string) {
    return this.projectsService.getLinkedRepos(projectId);
  }

  @Post(':id/repos')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async linkRepo(
    @Param('id') projectId: string,
    @Body() body: { repoFullName: string },
    @Request() req,
  ) {
    const result = await this.projectsService.linkRepo(
      projectId,
      body.repoFullName,
    );

    await this.auditLogService.logProjectAccess(
      req.user.id,
      projectId,
      'link_repo',
      { repoFullName: body.repoFullName },
    );

    return result;
  }

  @Delete(':id/repos/:repoId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkRepo(
    @Param('id') projectId: string,
    @Param('repoId') repoId: string,
    @Request() req,
  ) {
    await this.projectsService.unlinkRepo(projectId, repoId);

    await this.auditLogService.logProjectAccess(
      req.user.id,
      projectId,
      'unlink_repo',
      { repoId },
    );
  }

  @Get(':id/activity')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getProjectActivity(
    @Param('id') projectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.getProjectActivity(
      projectId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  // --- Convenience routes for frontend ---
  // These proxy to the board-scoped controllers using the project's default board.

  // Board
  @Get(':id/kanban')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getDefaultBoard(@Param('id') projectId: string) {
    return this.kanbanService.getDefaultBoard(projectId);
  }

  @Patch(':id/kanban')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async updateDefaultBoard(
    @Param('id') projectId: string,
    @Body() dto: any,
  ) {
    const board = await this.kanbanService.getDefaultBoard(projectId);
    return this.kanbanService.updateBoard(board.id, dto);
  }

  // Columns
  @Post(':id/kanban/columns')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async createColumn(
    @Param('id') projectId: string,
    @Body() dto: CreateColumnDto,
  ) {
    const board = await this.kanbanService.getDefaultBoard(projectId);
    return this.kanbanService.createColumn(board.id, dto);
  }

  @Patch(':id/kanban/columns/reorder')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async reorderColumns(
    @Param('id') projectId: string,
    @Body() dto: ReorderColumnsDto,
  ) {
    const board = await this.kanbanService.getDefaultBoard(projectId);
    return this.kanbanService.reorderColumns(board.id, dto);
  }

  @Patch(':id/kanban/columns/:columnId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async updateColumn(
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.kanbanService.updateColumn(columnId, dto);
  }

  @Delete(':id/kanban/columns/:columnId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteColumn(@Param('columnId') columnId: string) {
    return this.kanbanService.deleteColumn(columnId);
  }

  // Cards
  @Get(':id/cards')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getCardsByProject(
    @Param('id') projectId: string,
    @Query() query: ListCardsQueryDto,
  ) {
    const board = await this.kanbanService.getDefaultBoard(projectId);
    const result = await this.cardsService.listCards(board.id, query);
    return result.items;
  }

  @Post(':id/cards')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async createCard(
    @Param('id') projectId: string,
    @Body() dto: CreateCardDto,
    @Request() req,
  ) {
    if (!dto.reporterId) {
      dto.reporterId = req.user.id;
    }
    const board = await this.kanbanService.getDefaultBoard(projectId);
    const columnId = dto.columnId || board.columns?.[0]?.id;
    if (!columnId) {
      throw new Error('No column available');
    }
    return this.cardsService.createCard(board.id, columnId, dto);
  }

  @Get(':id/cards/:cardId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getCard(@Param('cardId') cardId: string) {
    return this.cardsService.getCardById(cardId);
  }

  @Patch(':id/cards/:cardId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async updateCard(
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
    @Request() req,
  ) {
    return this.cardsService.updateCard(cardId, dto, req.user.id);
  }

  @Patch(':id/cards/:cardId/move')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async moveCard(
    @Param('cardId') cardId: string,
    @Body() dto: MoveCardDto,
    @Request() req,
  ) {
    return this.cardsService.moveCard(cardId, dto, req.user.id);
  }

  @Delete(':id/cards/:cardId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCard(
    @Param('cardId') cardId: string,
    @Request() req,
  ) {
    return this.cardsService.deleteCard(cardId, req.user.id);
  }

  @Patch(':id/cards/bulk')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async bulkUpdateCards(
    @Param('id') projectId: string,
    @Body() dto: any,
    @Request() req,
  ) {
    const board = await this.kanbanService.getDefaultBoard(projectId);
    return this.cardsService.bulkOperation(board.id, dto, req.user.id);
  }

  // Comments
  @Get(':id/cards/:cardId/comments')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getComments(
    @Param('cardId') cardId: string,
    @Query() query: any,
  ) {
    return this.commentsService.listComments(cardId, query);
  }

  @Post(':id/cards/:cardId/comments')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async createComment(
    @Param('cardId') cardId: string,
    @Body() dto: CreateCommentDto,
    @Request() req,
  ) {
    return this.commentsService.createComment(cardId, dto, req.user.id);
  }

  @Patch(':id/cards/:cardId/comments/:commentId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('write')
  async updateComment(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @Request() req,
  ) {
    return this.commentsService.updateComment(commentId, dto, req.user.id);
  }

  @Delete(':id/cards/:cardId/comments/:commentId')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @Param('commentId') commentId: string,
    @Request() req,
  ) {
    return this.commentsService.deleteComment(commentId, req.user.id);
  }
}
