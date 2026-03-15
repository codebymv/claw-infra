import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { KanbanService } from './kanban.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { ProjectAuthGuard } from './auth/project-auth.guard';
import { ProjectAccessGuard } from './auth/project-access.guard';
import { RequireResourcePermission } from './auth/resource-access.guard';
import { AuditLogService } from './auth/audit-log.service';

@Controller('projects/:projectId/boards')
@UseGuards(ProjectAuthGuard, ProjectAccessGuard)
export class KanbanController {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Board endpoints
  @Post()
  @RequireResourcePermission('board', 'write')
  async createBoard(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardDto,
    @Request() req,
  ) {
    const result = await this.kanbanService.createBoard(projectId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'board.create',
      resource: 'board',
      resourceId: result.id,
      projectId,
      metadata: { name: dto.name },
    });

    return result;
  }

  @Get()
  async getBoardsByProject(
    @Param('projectId') projectId: string,
    @Request() req,
  ) {
    const result = await this.kanbanService.getBoardsByProject(projectId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'board.list',
      resource: 'board',
      resourceId: 'list',
      projectId,
      metadata: { count: result.length },
    });

    return result;
  }

  @Get('default')
  async getDefaultBoard(@Param('projectId') projectId: string, @Request() req) {
    const result = await this.kanbanService.getDefaultBoard(projectId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'board.get_default',
      resource: 'board',
      resourceId: result.id,
      projectId,
    });

    return result;
  }

  @Get(':boardId')
  @RequireResourcePermission('board', 'read')
  async getBoard(@Param('boardId') boardId: string, @Request() req) {
    const result = await this.kanbanService.getBoardById(boardId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'board.get',
      resource: 'board',
      resourceId: boardId,
      projectId: req.projectContext.project.id,
    });

    return result;
  }

  @Put(':boardId')
  @RequireResourcePermission('board', 'write')
  async updateBoard(
    @Param('boardId') boardId: string,
    @Body() dto: UpdateBoardDto,
    @Request() req,
  ) {
    const result = await this.kanbanService.updateBoard(boardId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'board.update',
      resource: 'board',
      resourceId: boardId,
      projectId: req.projectContext.project.id,
      metadata: dto,
    });

    return result;
  }

  @Delete(':boardId')
  @RequireResourcePermission('board', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBoard(@Param('boardId') boardId: string, @Request() req) {
    await this.kanbanService.deleteBoard(boardId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'board.delete',
      resource: 'board',
      resourceId: boardId,
      projectId: req.projectContext.project.id,
    });
  }

  // Column endpoints
  @Post(':boardId/columns')
  @RequireResourcePermission('board', 'write')
  async createColumn(
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
    @Request() req,
  ) {
    const result = await this.kanbanService.createColumn(boardId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'column.create',
      resource: 'column',
      resourceId: result.id,
      projectId: req.projectContext.project.id,
      metadata: { name: dto.name, boardId },
    });

    return result;
  }

  @Get(':boardId/columns')
  @RequireResourcePermission('board', 'read')
  async getColumnsByBoard(@Param('boardId') boardId: string, @Request() req) {
    const result = await this.kanbanService.getColumnsByBoard(boardId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'column.list',
      resource: 'column',
      resourceId: 'list',
      projectId: req.projectContext.project.id,
      metadata: { boardId, count: result.length },
    });

    return result;
  }

  @Get(':boardId/columns/:columnId')
  @RequireResourcePermission('board', 'read')
  async getColumn(@Param('columnId') columnId: string, @Request() req) {
    const result = await this.kanbanService.getColumnById(columnId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'column.get',
      resource: 'column',
      resourceId: columnId,
      projectId: req.projectContext.project.id,
    });

    return result;
  }

  @Put(':boardId/columns/:columnId')
  @RequireResourcePermission('board', 'write')
  async updateColumn(
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
    @Request() req,
  ) {
    const result = await this.kanbanService.updateColumn(columnId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'column.update',
      resource: 'column',
      resourceId: columnId,
      projectId: req.projectContext.project.id,
      metadata: dto,
    });

    return result;
  }

  @Delete(':boardId/columns/:columnId')
  @RequireResourcePermission('board', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteColumn(@Param('columnId') columnId: string, @Request() req) {
    await this.kanbanService.deleteColumn(columnId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'column.delete',
      resource: 'column',
      resourceId: columnId,
      projectId: req.projectContext.project.id,
    });
  }

  @Put(':boardId/columns/reorder')
  @RequireResourcePermission('board', 'write')
  async reorderColumns(
    @Param('boardId') boardId: string,
    @Body() dto: ReorderColumnsDto,
    @Request() req,
  ) {
    const result = await this.kanbanService.reorderColumns(boardId, dto);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'column.reorder',
      resource: 'column',
      resourceId: 'reorder',
      projectId: req.projectContext.project.id,
      metadata: { boardId, columnIds: dto.columnIds },
    });

    return result;
  }
}
