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
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import { ProjectAuthGuard } from './auth/project-auth.guard';
import {
  ResourceAccessGuard,
  RequireResourcePermission,
} from './auth/resource-access.guard';
import { AuditLogService } from './auth/audit-log.service';

@Controller('projects/:projectId/boards/:boardId/cards/:cardId/comments')
@UseGuards(ProjectAuthGuard, ResourceAccessGuard)
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @RequireResourcePermission('card', 'write')
  async createComment(
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
      action: 'comment.create',
      resource: 'comment',
      resourceId: result.id,
      projectId: req.projectContext.project.id,
      metadata: { cardId, contentLength: dto.content.length },
    });

    return result;
  }

  @Get()
  @RequireResourcePermission('card', 'read')
  async listComments(
    @Param('cardId') cardId: string,
    @Query() query: ListCommentsQueryDto,
    @Request() req,
  ) {
    const result = await this.commentsService.listComments(cardId, query);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'comment.list',
      resource: 'comment',
      resourceId: 'list',
      projectId: req.projectContext.project.id,
      metadata: { cardId, count: result.items.length },
    });

    return result;
  }

  @Get('stats')
  @RequireResourcePermission('card', 'read')
  async getCommentStats(@Param('cardId') cardId: string, @Request() req) {
    const result = await this.commentsService.getCommentStats(cardId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'comment.get_stats',
      resource: 'comment',
      resourceId: 'stats',
      projectId: req.projectContext.project.id,
      metadata: { cardId, stats: result },
    });

    return result;
  }

  @Get(':commentId')
  @RequireResourcePermission('comment', 'read')
  async getComment(@Param('commentId') commentId: string, @Request() req) {
    const result = await this.commentsService.getCommentById(commentId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'comment.get',
      resource: 'comment',
      resourceId: commentId,
      projectId: req.projectContext.project.id,
    });

    return result;
  }

  @Get(':commentId/thread')
  @RequireResourcePermission('comment', 'read')
  async getCommentThread(
    @Param('commentId') commentId: string,
    @Request() req,
  ) {
    const result = await this.commentsService.getCommentThread(commentId);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'comment.get_thread',
      resource: 'comment',
      resourceId: commentId,
      projectId: req.projectContext.project.id,
      metadata: {
        threadRootId: result.id,
        repliesCount: result.replies?.length || 0,
      },
    });

    return result;
  }

  @Put(':commentId')
  @RequireResourcePermission('comment', 'write')
  async updateComment(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @Request() req,
  ) {
    const result = await this.commentsService.updateComment(
      commentId,
      dto,
      req.user.id,
    );

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'comment.update',
      resource: 'comment',
      resourceId: commentId,
      projectId: req.projectContext.project.id,
      metadata: dto,
    });

    return result;
  }

  @Delete(':commentId')
  @RequireResourcePermission('comment', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(@Param('commentId') commentId: string, @Request() req) {
    await this.commentsService.deleteComment(commentId, req.user.id);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'comment.delete',
      resource: 'comment',
      resourceId: commentId,
      projectId: req.projectContext.project.id,
    });
  }
}
