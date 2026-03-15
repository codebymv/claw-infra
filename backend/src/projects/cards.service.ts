import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  QueryDeepPartialEntity,
  In,
  Between,
  Like,
  ILike,
} from 'typeorm';
import { Card, CardStatus } from '../database/entities/card.entity';
import { Column, ColumnRuleType } from '../database/entities/column.entity';
import { KanbanBoard } from '../database/entities/kanban-board.entity';
import {
  CardHistory,
  HistoryAction,
} from '../database/entities/card-history.entity';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { BulkCardOperationDto } from './dto/bulk-card-operation.dto';
import { ListCardsQueryDto } from './dto/list-cards-query.dto';
import { ProjectWebSocketGateway } from './ws/project-websocket.gateway';
import { ProjectPubSubService } from './ws/project-pubsub.service';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @InjectRepository(Card) private readonly cardRepo: Repository<Card>,
    @InjectRepository(Column) private readonly columnRepo: Repository<Column>,
    @InjectRepository(KanbanBoard)
    private readonly boardRepo: Repository<KanbanBoard>,
    @InjectRepository(CardHistory)
    private readonly historyRepo: Repository<CardHistory>,
    private readonly gateway: ProjectWebSocketGateway,
    private readonly pubSub: ProjectPubSubService,
  ) {}

  async createCard(
    boardId: string,
    columnId: string,
    dto: CreateCardDto,
  ): Promise<Card> {
    // Validate board and column exist and are related
    const column = await this.columnRepo.findOne({
      where: { id: columnId, boardId },
      relations: ['board'],
    });

    if (!column) {
      throw new NotFoundException(
        `Column ${columnId} not found in board ${boardId}`,
      );
    }

    // Determine position if not provided
    if (dto.position === undefined) {
      const maxPosition = await this.cardRepo
        .createQueryBuilder('card')
        .select('MAX(card.position)', 'maxPosition')
        .where('card.columnId = :columnId', { columnId })
        .getRawOne<{ maxPosition: number }>();

      dto.position = (maxPosition?.maxPosition || 0) + 1;
    } else {
      // Shift existing cards if inserting at specific position
      await this.shiftCardsPosition(columnId, dto.position, 1);
    }

    // Validate custom fields against board schema
    if (dto.customFields) {
      await this.validateCustomFields(boardId, dto.customFields);
    }

    const card = this.cardRepo.create({
      boardId,
      columnId,
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      tags: dto.tags || [],
      customFields: dto.customFields || {},
    });

    const saved = await this.cardRepo.save(card);

    // Create history entry
    await this.createHistoryEntry(
      saved.id,
      HistoryAction.CREATED,
      dto.reporterId,
      {
        action: 'Card created',
        details: { title: saved.title, columnId },
      },
    );

    // Enforce column rules
    await this.enforceColumnRules(columnId, saved.id);

    const result = await this.getCardById(saved.id);

    // Broadcast card creation
    await this.pubSub.publishCardEvent(
      column.board.projectId,
      saved.id,
      'create',
      result,
      dto.reporterId,
    );

    this.logger.log(`Created card ${saved.id} in column ${columnId}`);
    return result;
  }

  async getCardById(id: string): Promise<Card> {
    const card = await this.cardRepo.findOne({
      where: { id },
      relations: [
        'board',
        'column',
        'assignee',
        'reporter',
        'comments',
        'history',
      ],
      order: {
        comments: { createdAt: 'ASC' },
        history: { createdAt: 'DESC' },
      },
    });

    if (!card) {
      throw new NotFoundException(`Card ${id} not found`);
    }

    return card;
  }

  async listCards(boardId: string, query: ListCardsQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const queryBuilder = this.cardRepo
      .createQueryBuilder('card')
      .leftJoinAndSelect('card.assignee', 'assignee')
      .leftJoinAndSelect('card.reporter', 'reporter')
      .leftJoinAndSelect('card.column', 'column')
      .leftJoinAndSelect('card.board', 'board')
      .where('card.boardId = :boardId', { boardId })
      .skip(skip)
      .take(limit);

    // Apply filters
    if (query.columnId) {
      queryBuilder.andWhere('card.columnId = :columnId', {
        columnId: query.columnId,
      });
    }

    if (query.type) {
      queryBuilder.andWhere('card.type = :type', { type: query.type });
    }

    if (query.priority) {
      queryBuilder.andWhere('card.priority = :priority', {
        priority: query.priority,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('card.status = :status', { status: query.status });
    }

    if (query.assigneeId) {
      queryBuilder.andWhere('card.assigneeId = :assigneeId', {
        assigneeId: query.assigneeId,
      });
    }

    if (query.reporterId) {
      queryBuilder.andWhere('card.reporterId = :reporterId', {
        reporterId: query.reporterId,
      });
    }

    if (query.tags && query.tags.length > 0) {
      queryBuilder.andWhere('card.tags && :tags', { tags: query.tags });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(card.title ILIKE :search OR card.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.dueBefore) {
      queryBuilder.andWhere('card.due_date <= :dueBefore', {
        dueBefore: new Date(query.dueBefore),
      });
    }

    if (query.dueAfter) {
      queryBuilder.andWhere('card.due_date >= :dueAfter', {
        dueAfter: new Date(query.dueAfter),
      });
    }

    // Apply sorting
    const sortField = this.getSortField(query.sortBy || 'position');
    queryBuilder.orderBy(`card.${sortField}`, query.sortOrder || 'ASC');

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async updateCard(
    id: string,
    dto: UpdateCardDto,
    userId: string,
  ): Promise<Card> {
    const card = await this.getCardById(id);
    const originalData = { ...card };

    // Handle position changes
    if (dto.position !== undefined && dto.position !== card.position) {
      await this.reorderCard(id, dto.position);
      delete dto.position; // Remove from update as it's handled separately
    }

    // Validate custom fields if provided
    if (dto.customFields) {
      await this.validateCustomFields(card.boardId, dto.customFields);
      dto.customFields = { ...card.customFields, ...dto.customFields };
    }

    // Handle status changes
    if (dto.status && dto.status !== card.status) {
      await this.handleStatusChange(card, dto.status, userId);
    }

    // Convert date string to Date object
    if (dto.dueDate) {
      (dto as any).dueDate = new Date(dto.dueDate);
    }

    await this.cardRepo.update(id, dto as QueryDeepPartialEntity<Card>);
    const updated = await this.getCardById(id);

    // Create history entry for significant changes
    const changes = this.detectChanges(originalData, updated);
    if (changes.length > 0) {
      await this.createHistoryEntry(id, HistoryAction.UPDATED, userId, {
        action: 'Card updated',
        details: { changes },
      });
    }

    // Broadcast card update
    await this.pubSub.publishCardEvent(
      card.board.projectId,
      id,
      'update',
      updated,
      userId,
    );

    this.logger.log(`Updated card ${id} by user ${userId}`);
    return updated;
  }

  async moveCard(id: string, dto: MoveCardDto, userId: string): Promise<Card> {
    const card = await this.getCardById(id);

    // Validate target column exists and is in the same board
    const targetColumn = await this.columnRepo.findOne({
      where: { id: dto.targetColumnId, boardId: card.boardId },
      relations: ['board'],
    });

    if (!targetColumn) {
      throw new NotFoundException(
        `Target column ${dto.targetColumnId} not found in board ${card.boardId}`,
      );
    }

    const originalColumnId = card.columnId;

    // Determine target position
    let targetPosition = dto.position;
    if (targetPosition === undefined) {
      const maxPosition = await this.cardRepo
        .createQueryBuilder('card')
        .select('MAX(card.position)', 'maxPosition')
        .where('card.columnId = :columnId', { columnId: dto.targetColumnId })
        .getRawOne<{ maxPosition: number }>();

      targetPosition = (maxPosition?.maxPosition || 0) + 1;
    }

    // If moving within the same column, handle reordering
    if (originalColumnId === dto.targetColumnId) {
      await this.reorderCard(id, targetPosition);
    } else {
      // Moving to different column
      // Remove from original column (shift cards up)
      await this.shiftCardsPosition(originalColumnId, card.position + 1, -1);

      // Add to target column (shift cards down if needed)
      await this.shiftCardsPosition(dto.targetColumnId, targetPosition, 1);

      // Update card's column and position
      await this.cardRepo.update(id, {
        columnId: dto.targetColumnId,
        position: targetPosition,
      });

      // Enforce column rules for target column
      await this.enforceColumnRules(dto.targetColumnId, id);
    }

    const updated = await this.getCardById(id);

    // Create history entry
    await this.createHistoryEntry(id, HistoryAction.MOVED, userId, {
      action: 'Card moved',
      details: {
        fromColumn: originalColumnId,
        toColumn: dto.targetColumnId,
        position: targetPosition,
      },
    });

    // Broadcast card move
    await this.gateway.broadcastCardMove(targetColumn.board.projectId, id, {
      fromColumnId: originalColumnId,
      toColumnId: dto.targetColumnId,
      fromPosition: card.position,
      toPosition: targetPosition,
      userId,
    });

    this.logger.log(
      `Moved card ${id} from column ${originalColumnId} to ${dto.targetColumnId}`,
    );
    return updated;
  }

  async deleteCard(id: string, userId: string): Promise<void> {
    const card = await this.getCardById(id);

    // Shift remaining cards to fill the gap
    await this.shiftCardsPosition(card.columnId, card.position + 1, -1);

    await this.cardRepo.delete(id);

    // Broadcast card deletion
    await this.pubSub.publishCardEvent(
      card.board.projectId,
      id,
      'delete',
      { columnId: card.columnId },
      userId,
    );

    this.logger.log(`Deleted card ${id} by user ${userId}`);
  }

  async bulkOperation(
    boardId: string,
    dto: BulkCardOperationDto,
    userId: string,
  ): Promise<any> {
    // Validate all cards belong to the board
    const cards = await this.cardRepo.find({
      where: { id: In(dto.cardIds), boardId },
      relations: ['column', 'board'],
    });

    if (cards.length !== dto.cardIds.length) {
      const foundIds = cards.map((c) => c.id);
      const missingIds = dto.cardIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(
        `Cards not found in board: ${missingIds.join(', ')}`,
      );
    }

    let result: any;

    switch (dto.operation) {
      case 'update':
        result = await this.bulkUpdate(cards, dto.updateData!, userId);
        break;
      case 'move':
        if (!dto.targetColumnId) {
          throw new BadRequestException(
            'targetColumnId is required for move operation',
          );
        }
        result = await this.bulkMove(cards, dto.targetColumnId, userId);
        break;
      case 'delete':
        result = await this.bulkDelete(cards, userId);
        break;
      default:
        throw new BadRequestException(`Invalid operation: ${dto.operation}`);
    }

    // Broadcast bulk operation
    await this.pubSub.publishProjectEvent({
      type: 'update',
      resource: 'card',
      resourceId: 'bulk',
      projectId: boardId,
      userId,
      timestamp: new Date().toISOString(),
      data: {
        operation: dto.operation,
        cardIds: dto.cardIds,
        result,
      },
      metadata: { bulkOperation: true },
    });

    this.logger.log(
      `Bulk ${dto.operation} operation on ${dto.cardIds.length} cards by user ${userId}`,
    );
    return result;
  }

  // Private helper methods
  private async validateCustomFields(
    boardId: string,
    customFields: Record<string, any>,
  ): Promise<void> {
    const board = await this.boardRepo.findOne({ where: { id: boardId } });
    if (!board) return;

    const boardCustomFields = board.layout.customFields || [];

    for (const [fieldId, value] of Object.entries(customFields)) {
      const fieldDef = boardCustomFields.find((f) => f.id === fieldId);
      if (!fieldDef) continue;

      // Validate required fields
      if (
        fieldDef.required &&
        (value === null || value === undefined || value === '')
      ) {
        throw new BadRequestException(
          `Custom field '${fieldDef.name}' is required`,
        );
      }

      // Validate field types
      if (value !== null && value !== undefined) {
        await this.validateCustomFieldValue(fieldDef, value);
      }
    }
  }

  private async validateCustomFieldValue(
    fieldDef: any,
    value: any,
  ): Promise<void> {
    switch (fieldDef.type) {
      case 'number':
        if (typeof value !== 'number') {
          throw new BadRequestException(
            `Field '${fieldDef.name}' must be a number`,
          );
        }
        break;
      case 'date':
        if (!Date.parse(value)) {
          throw new BadRequestException(
            `Field '${fieldDef.name}' must be a valid date`,
          );
        }
        break;
      case 'select':
        if (fieldDef.options && !fieldDef.options.includes(value)) {
          throw new BadRequestException(
            `Field '${fieldDef.name}' must be one of: ${fieldDef.options.join(', ')}`,
          );
        }
        break;
      case 'multiselect':
        if (
          !Array.isArray(value) ||
          !value.every((v) => fieldDef.options?.includes(v))
        ) {
          throw new BadRequestException(
            `Field '${fieldDef.name}' must be an array of valid options`,
          );
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `Field '${fieldDef.name}' must be a boolean`,
          );
        }
        break;
    }
  }

  private async handleStatusChange(
    card: Card,
    newStatus: CardStatus,
    userId: string,
  ): Promise<void> {
    // Auto-complete card when moved to completed column
    if (
      newStatus === CardStatus.COMPLETED &&
      card.status !== CardStatus.COMPLETED
    ) {
      const column = await this.columnRepo.findOne({
        where: { id: card.columnId },
      });
      if (column?.isCompleted) {
        await this.cardRepo.update(card.id, { completedAt: new Date() });
      }
    }

    // Clear completion date when moving away from completed status
    if (
      card.status === CardStatus.COMPLETED &&
      newStatus !== CardStatus.COMPLETED
    ) {
      await this.cardRepo.update(card.id, { completedAt: null });
    }
  }

  private async createHistoryEntry(
    cardId: string,
    action: HistoryAction,
    userId: string,
    metadata: any,
  ): Promise<void> {
    const history = this.historyRepo.create({
      cardId,
      action,
      userId,
      metadata,
    });

    await this.historyRepo.save(history);
  }

  private detectChanges(
    original: Card,
    updated: Card,
  ): Array<{ field: string; from: any; to: any }> {
    const changes: Array<{ field: string; from: any; to: any }> = [];
    const fields = [
      'title',
      'description',
      'type',
      'priority',
      'status',
      'assigneeId',
      'dueDate',
      'tags',
    ];

    for (const field of fields) {
      if (JSON.stringify(original[field]) !== JSON.stringify(updated[field])) {
        changes.push({
          field,
          from: original[field],
          to: updated[field],
        });
      }
    }

    return changes;
  }

  private async shiftCardsPosition(
    columnId: string,
    fromPosition: number,
    shift: number,
  ): Promise<void> {
    await this.cardRepo
      .createQueryBuilder()
      .update(Card)
      .set({ position: () => `position + ${shift}` })
      .where('columnId = :columnId AND position >= :fromPosition', {
        columnId,
        fromPosition,
      })
      .execute();
  }

  private async reorderCard(
    cardId: string,
    newPosition: number,
  ): Promise<void> {
    const card = await this.getCardById(cardId);
    const oldPosition = card.position;

    if (oldPosition === newPosition) return;

    if (newPosition > oldPosition) {
      // Moving down: shift cards between old and new position up
      await this.cardRepo
        .createQueryBuilder()
        .update(Card)
        .set({ position: () => 'position - 1' })
        .where(
          'columnId = :columnId AND position > :oldPosition AND position <= :newPosition',
          {
            columnId: card.columnId,
            oldPosition,
            newPosition,
          },
        )
        .execute();
    } else {
      // Moving up: shift cards between new and old position down
      await this.cardRepo
        .createQueryBuilder()
        .update(Card)
        .set({ position: () => 'position + 1' })
        .where(
          'columnId = :columnId AND position >= :newPosition AND position < :oldPosition',
          {
            columnId: card.columnId,
            oldPosition,
            newPosition,
          },
        )
        .execute();
    }

    // Update the moved card
    await this.cardRepo.update(cardId, { position: newPosition });
  }

  private getSortField(sortBy: string): string {
    const fieldMap = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      dueDate: 'dueDate',
      priority: 'priority',
      position: 'position',
    };

    return fieldMap[sortBy] || 'position';
  }

  private async bulkUpdate(
    cards: Card[],
    updateData: any,
    userId: string,
  ): Promise<Card[]> {
    const cardIds = cards.map((c) => c.id);

    await this.cardRepo.update({ id: In(cardIds) }, updateData);

    // Create history entries
    await Promise.all(
      cardIds.map((cardId) =>
        this.createHistoryEntry(cardId, HistoryAction.UPDATED, userId, {
          action: 'Bulk update',
          details: updateData,
        }),
      ),
    );

    return this.cardRepo.find({ where: { id: In(cardIds) } });
  }

  private async bulkMove(
    cards: Card[],
    targetColumnId: string,
    userId: string,
  ): Promise<Card[]> {
    // Validate target column
    const targetColumn = await this.columnRepo.findOne({
      where: { id: targetColumnId },
    });

    if (!targetColumn) {
      throw new NotFoundException(`Target column ${targetColumnId} not found`);
    }

    // Move all cards to target column
    const cardIds = cards.map((c) => c.id);

    // Get next available positions in target column
    const maxPosition = await this.cardRepo
      .createQueryBuilder('card')
      .select('MAX(card.position)', 'maxPosition')
      .where('card.columnId = :columnId', { columnId: targetColumnId })
      .getRawOne<{ maxPosition: number }>();

    let nextPosition = (maxPosition?.maxPosition || 0) + 1;

    // Update each card
    for (const card of cards) {
      await this.cardRepo.update(card.id, {
        columnId: targetColumnId,
        position: nextPosition++,
      });

      await this.createHistoryEntry(card.id, HistoryAction.MOVED, userId, {
        action: 'Bulk move',
        details: {
          fromColumn: card.columnId,
          toColumn: targetColumnId,
        },
      });
    }

    return this.cardRepo.find({ where: { id: In(cardIds) } });
  }

  private async bulkDelete(cards: Card[], userId: string): Promise<void> {
    const cardIds = cards.map((c) => c.id);

    // Group cards by column for position adjustment
    const cardsByColumn = cards.reduce(
      (acc, card) => {
        if (!acc[card.columnId]) acc[card.columnId] = [];
        acc[card.columnId].push(card);
        return acc;
      },
      {} as Record<string, Card[]>,
    );

    // Delete cards
    await this.cardRepo.delete({ id: In(cardIds) });

    // Adjust positions in each affected column
    for (const [columnId, columnCards] of Object.entries(cardsByColumn)) {
      const sortedCards = columnCards.sort((a, b) => a.position - b.position);

      for (const card of sortedCards) {
        await this.shiftCardsPosition(columnId, card.position + 1, -1);
      }
    }
  }

  private async enforceColumnRules(
    columnId: string,
    cardId?: string,
  ): Promise<void> {
    const column = await this.columnRepo.findOne({
      where: { id: columnId },
      relations: ['cards'],
    });

    if (!column) return;

    for (const rule of column.rules) {
      if (!rule.isActive) continue;

      switch (rule.type) {
        case ColumnRuleType.WIP_LIMIT:
          await this.enforceWipLimit(columnId, column.wipLimit);
          break;
        case ColumnRuleType.AUTO_ASSIGN:
          if (cardId) await this.enforceAutoAssign(cardId, rule);
          break;
        case ColumnRuleType.AUTO_MOVE:
          if (cardId) await this.enforceAutoMove(cardId, rule);
          break;
        case ColumnRuleType.VALIDATION:
          if (cardId) await this.enforceValidation(cardId, rule);
          break;
      }
    }
  }

  private async enforceWipLimit(
    columnId: string,
    wipLimit: number | null,
  ): Promise<void> {
    if (!wipLimit) return;

    const cardCount = await this.cardRepo.count({ where: { columnId } });
    if (cardCount > wipLimit) {
      const column = await this.columnRepo.findOne({ where: { id: columnId } });
      throw new BadRequestException(
        `WIP limit exceeded. Column "${column?.name}" has ${cardCount} cards but limit is ${wipLimit}.`,
      );
    }
  }

  private async enforceAutoAssign(cardId: string, rule: any): Promise<void> {
    // Implementation would depend on the specific auto-assign logic
    // This is a placeholder for the rule enforcement
    this.logger.debug(
      `Enforcing auto-assign rule for card ${cardId}: ${rule.condition}`,
    );
  }

  private async enforceAutoMove(cardId: string, rule: any): Promise<void> {
    // Implementation would depend on the specific auto-move logic
    // This is a placeholder for the rule enforcement
    this.logger.debug(
      `Enforcing auto-move rule for card ${cardId}: ${rule.condition}`,
    );
  }

  private async enforceValidation(cardId: string, rule: any): Promise<void> {
    // Implementation would depend on the specific validation logic
    // This is a placeholder for the rule enforcement
    this.logger.debug(
      `Enforcing validation rule for card ${cardId}: ${rule.condition}`,
    );
  }
}
