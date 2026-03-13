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
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { BulkCardOperationDto } from './dto/bulk-card-operation.dto';
import { ListCardsQueryDto } from './dto/list-cards-query.dto';
import { ProjectAuthGuard } from './auth/project-auth.guard';
import { ResourceAccessGuard, RequireResourcePermission } from './auth/resource-access.guard';
import { AuditLogService } from './auth/audit-log.service';

@Controller('projects/:projectId/boards/:boardId')
@UseGuards(ProjectAuthGuard, ResourceAccessGuard)
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Card endpoints
  @Post('columns/:columnId/cards')
  @RequireResourcePermission('board', 'write')
  async createCard(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: CreateCardDto,
    @Request() req,
  ) {
    // Set reporter to current user if not provided
    if (!dto.reporterId) {
      dto.reporterId = req.user.id;
    }
    
    const result = await this.cardsService.createCard(boardId, columnId, dto);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.create',
      resource: 'card',
      resourceId: result.id,
      projectId: req.projectContext.project.id,
      metadata: { title: dto.title, columnId, boardId },
    });

    return result;
  }

  @Get('cards')
  @RequireResourcePermission('board', 'read')
  async listCards(
    @Param('boardId') boardId: string,
    @Query() query: ListCardsQueryDto,
    @Request() req,
  ) {
    const result = await this.cardsService.listCards(boardId, query);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.list',
      resource: 'card',
      resourceId: 'list',
      projectId: req.projectContext.project.id,
      metadata: { boardId, filters: query, count: result.items.length },
    });

    return result;
  }

  @Get('cards/:cardId')
  @RequireResourcePermission('card', 'read')
  async getCard(@Param('cardId') cardId: string, @Request() req) {
    const result = await this.cardsService.getCardById(cardId);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.get',
      resource: 'card',
      resourceId: cardId,
      projectId: req.projectContext.project.id,
    });

    return result;
  }

  @Put('cards/:cardId')
  @RequireResourcePermission('card', 'write')
  async updateCard(
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
    @Request() req,
  ) {
    const result = await this.cardsService.updateCard(cardId, dto, req.user.id);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.update',
      resource: 'card',
      resourceId: cardId,
      projectId: req.projectContext.project.id,
      metadata: dto,
    });

    return result;
  }

  @Put('cards/:cardId/move')
  @RequireResourcePermission('card', 'write')
  async moveCard(
    @Param('cardId') cardId: string,
    @Body() dto: MoveCardDto,
    @Request() req,
  ) {
    const result = await this.cardsService.moveCard(cardId, dto, req.user.id);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.move',
      resource: 'card',
      resourceId: cardId,
      projectId: req.projectContext.project.id,
      metadata: { targetColumnId: dto.targetColumnId, position: dto.position },
    });

    return result;
  }

  @Delete('cards/:cardId')
  @RequireResourcePermission('card', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCard(@Param('cardId') cardId: string, @Request() req) {
    await this.cardsService.deleteCard(cardId, req.user.id);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.delete',
      resource: 'card',
      resourceId: cardId,
      projectId: req.projectContext.project.id,
    });
  }

  @Post('cards/bulk')
  @RequireResourcePermission('board', 'write')
  async bulkOperation(
    @Param('boardId') boardId: string,
    @Body() dto: BulkCardOperationDto,
    @Request() req,
  ) {
    const result = await this.cardsService.bulkOperation(boardId, dto, req.user.id);
    
    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'card.bulk_operation',
      resource: 'card',
      resourceId: 'bulk',
      projectId: req.projectContext.project.id,
      metadata: { operation: dto.operation, cardIds: dto.cardIds, boardId },
    });

    return result;
  }
}