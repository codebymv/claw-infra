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
} from '@nestjs/common';
import { ProjectAuthGuard } from './auth/project-auth.guard';
import {
  ProjectAccessGuard,
  RequireProjectPermission,
} from './auth/project-access.guard';
import { ProjectsService } from './projects.service';
import { KanbanService } from './kanban.service';
import { CardsService } from './cards.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { ListCardsQueryDto } from './dto/list-cards-query.dto';
import { AuditLogService } from './auth/audit-log.service';

@Controller('projects')
@UseGuards(ProjectAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly kanbanService: KanbanService,
    private readonly cardsService: CardsService,
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

  @Get(':id/kanban')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getDefaultBoard(@Param('id') projectId: string) {
    return this.kanbanService.getDefaultBoard(projectId);
  }

  @Get(':id/cards')
  @UseGuards(ProjectAccessGuard)
  @RequireProjectPermission('read')
  async getCardsByProject(
    @Param('id') projectId: string,
    @Query() query: ListCardsQueryDto,
  ) {
    const board = await this.kanbanService.getDefaultBoard(projectId);
    return this.cardsService.listCards(board.id, query);
  }
}
