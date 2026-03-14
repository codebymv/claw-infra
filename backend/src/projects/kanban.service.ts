import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryDeepPartialEntity, Not } from 'typeorm';
import { KanbanBoard, BoardLayout } from '../database/entities/kanban-board.entity';
import { Column, ColumnRule, ColumnRuleType } from '../database/entities/column.entity';
import { Card } from '../database/entities/card.entity';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { AppGateway } from '../ws/app.gateway';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(
    @InjectRepository(KanbanBoard) private readonly boardRepo: Repository<KanbanBoard>,
    @InjectRepository(Column) private readonly columnRepo: Repository<Column>,
    @InjectRepository(Card) private readonly cardRepo: Repository<Card>,
    private readonly gateway: AppGateway,
  ) {}

  // Board Management
  async createBoard(projectId: string, dto: CreateBoardDto): Promise<KanbanBoard> {
    // If this is set as default, unset other default boards
    if (dto.isDefault) {
      await this.boardRepo.update(
        { projectId, isDefault: true },
        { isDefault: false }
      );
    }

    // Apply default layout if not provided
    const defaultLayout: BoardLayout = {
      columnOrder: [],
      customFields: [],
      filters: [],
    };

    const layout = { ...defaultLayout, ...dto.layout };

    const board = this.boardRepo.create({
      projectId,
      ...dto,
      layout,
    });

    const saved = await this.boardRepo.save(board);

    // Create default columns if none exist
    if (!dto.layout?.columnOrder?.length) {
      await this.createDefaultColumns(saved.id);
    }

    const result = await this.getBoardById(saved.id);
    
    // Broadcast board creation
    this.gateway.broadcastProjectUpdate(projectId, {
      type: 'board.created',
      board: result,
    });

    this.logger.log(`Created board ${saved.id} for project ${projectId}`);
    return result;
  }

  async getBoardById(id: string): Promise<KanbanBoard> {
    const board = await this.boardRepo.findOne({
      where: { id },
      relations: ['project', 'columns', 'cards'],
      order: {
        columns: { order: 'ASC' },
        cards: { position: 'ASC' },
      },
    });

    if (!board) {
      throw new NotFoundException(`Board ${id} not found`);
    }

    return board;
  }

  async getBoardsByProject(projectId: string): Promise<KanbanBoard[]> {
    return this.boardRepo.find({
      where: { projectId },
      relations: ['columns', 'cards'],
      order: {
        isDefault: 'DESC',
        createdAt: 'ASC',
        columns: { order: 'ASC' },
        cards: { position: 'ASC' },
      },
    });
  }

  async getDefaultBoard(projectId: string): Promise<KanbanBoard> {
    const board = await this.boardRepo.findOne({
      where: { projectId, isDefault: true },
      relations: ['columns', 'cards'],
      order: {
        columns: { order: 'ASC' },
        cards: { position: 'ASC' },
      },
    });

    if (!board) {
      // If no default board exists, get the first board
      const firstBoard = await this.boardRepo.findOne({
        where: { projectId },
        relations: ['columns', 'cards'],
        order: {
          createdAt: 'ASC',
          columns: { order: 'ASC' },
          cards: { position: 'ASC' },
        },
      });

      if (!firstBoard) {
        throw new NotFoundException(`No boards found for project ${projectId}`);
      }

      return firstBoard;
    }

    return board;
  }

  async updateBoard(id: string, dto: UpdateBoardDto): Promise<KanbanBoard> {
    const board = await this.getBoardById(id);

    // If setting as default, unset other default boards in the same project
    if (dto.isDefault && !board.isDefault) {
      await this.boardRepo.update(
        { projectId: board.projectId, isDefault: true },
        { isDefault: false }
      );
    }

    // Merge layout settings
    if (dto.layout) {
      dto.layout = { ...board.layout, ...dto.layout };
    }

    await this.boardRepo.update(id, dto as QueryDeepPartialEntity<KanbanBoard>);
    const updated = await this.getBoardById(id);

    // Broadcast board update
    this.gateway.broadcastProjectUpdate(board.projectId, {
      type: 'board.updated',
      board: updated,
    });

    this.logger.log(`Updated board ${id}`);
    return updated;
  }

  async deleteBoard(id: string): Promise<void> {
    const board = await this.getBoardById(id);

    // Cannot delete the only board in a project
    const boardCount = await this.boardRepo.count({ where: { projectId: board.projectId } });
    if (boardCount <= 1) {
      throw new BadRequestException('Cannot delete the only board in a project');
    }

    // If deleting default board, set another board as default
    if (board.isDefault) {
      const nextBoard = await this.boardRepo.findOne({
        where: { 
          projectId: board.projectId,
          id: Not(id)
        },
        order: { createdAt: 'ASC' },
      });

      if (nextBoard) {
        await this.boardRepo.update(nextBoard.id, { isDefault: true });
      }
    }

    await this.boardRepo.delete(id);

    // Broadcast board deletion
    this.gateway.broadcastProjectUpdate(board.projectId, {
      type: 'board.deleted',
      boardId: id,
    });

    this.logger.log(`Deleted board ${id}`);
  }

  // Column Management
  async createColumn(boardId: string, dto: CreateColumnDto): Promise<Column> {
    const board = await this.getBoardById(boardId);

    // Determine order if not provided
    if (dto.order === undefined) {
      const maxOrder = await this.columnRepo
        .createQueryBuilder('column')
        .select('MAX(column.order)', 'maxOrder')
        .where('column.boardId = :boardId', { boardId })
        .getRawOne<{ maxOrder: number }>();

      dto.order = (maxOrder?.maxOrder || 0) + 1;
    } else {
      // Shift existing columns if inserting at specific position
      await this.shiftColumnsOrder(boardId, dto.order, 1);
    }

    const column = this.columnRepo.create({
      boardId,
      ...dto,
      color: dto.color || '#6B7280',
    });

    const saved = await this.columnRepo.save(column);

    // Update board layout column order
    await this.updateBoardColumnOrder(boardId);

    const result = await this.getColumnById(saved.id);

    // Broadcast column creation
    this.gateway.broadcastProjectUpdate(board.projectId, {
      type: 'column.created',
      column: result,
    });

    this.logger.log(`Created column ${saved.id} in board ${boardId}`);
    return result;
  }

  async getColumnById(id: string): Promise<Column> {
    const column = await this.columnRepo.findOne({
      where: { id },
      relations: ['board', 'cards'],
      order: { cards: { position: 'ASC' } },
    });

    if (!column) {
      throw new NotFoundException(`Column ${id} not found`);
    }

    return column;
  }

  async getColumnsByBoard(boardId: string): Promise<Column[]> {
    return this.columnRepo.find({
      where: { boardId },
      relations: ['cards'],
      order: { order: 'ASC', cards: { position: 'ASC' } },
    });
  }

  async updateColumn(id: string, dto: UpdateColumnDto): Promise<Column> {
    const column = await this.getColumnById(id);

    // Handle order changes
    if (dto.order !== undefined && dto.order !== column.order) {
      await this.reorderColumn(id, dto.order);
      delete dto.order; // Remove from update as it's handled separately
    }

    // Validate WIP limit rules
    if (dto.wipLimit !== undefined) {
      await this.validateWipLimit(column.boardId, id, dto.wipLimit);
    }

    await this.columnRepo.update(id, dto as QueryDeepPartialEntity<Column>);
    const updated = await this.getColumnById(id);

    // Broadcast column update
    this.gateway.broadcastProjectUpdate(column.board.projectId, {
      type: 'column.updated',
      column: updated,
    });

    this.logger.log(`Updated column ${id}`);
    return updated;
  }

  async deleteColumn(id: string): Promise<void> {
    const column = await this.getColumnById(id);

    // Cannot delete column if it has cards
    const cardCount = await this.cardRepo.count({ where: { columnId: id } });
    if (cardCount > 0) {
      throw new BadRequestException(`Cannot delete column with ${cardCount} cards. Move cards first.`);
    }

    // Cannot delete the only column in a board
    const columnCount = await this.columnRepo.count({ where: { boardId: column.boardId } });
    if (columnCount <= 1) {
      throw new BadRequestException('Cannot delete the only column in a board');
    }

    await this.columnRepo.delete(id);

    // Shift remaining columns to fill the gap
    await this.shiftColumnsOrder(column.boardId, column.order + 1, -1);

    // Update board layout column order
    await this.updateBoardColumnOrder(column.boardId);

    // Broadcast column deletion
    this.gateway.broadcastProjectUpdate(column.board.projectId, {
      type: 'column.deleted',
      columnId: id,
    });

    this.logger.log(`Deleted column ${id}`);
  }

  async reorderColumns(boardId: string, dto: ReorderColumnsDto): Promise<Column[]> {
    const board = await this.getBoardById(boardId);

    // Validate all column IDs belong to this board
    const existingColumns = await this.getColumnsByBoard(boardId);
    const existingIds = existingColumns.map(c => c.id);
    
    const invalidIds = dto.columnIds.filter(id => !existingIds.includes(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(`Invalid column IDs: ${invalidIds.join(', ')}`);
    }

    if (dto.columnIds.length !== existingIds.length) {
      throw new BadRequestException('Must provide all column IDs for reordering');
    }

    // Update column orders
    await Promise.all(
      dto.columnIds.map((columnId, index) =>
        this.columnRepo.update(columnId, { order: index + 1 })
      )
    );

    // Update board layout
    await this.updateBoardColumnOrder(boardId);

    const reorderedColumns = await this.getColumnsByBoard(boardId);

    // Broadcast column reorder
    this.gateway.broadcastProjectUpdate(board.projectId, {
      type: 'columns.reordered',
      columns: reorderedColumns,
    });

    this.logger.log(`Reordered columns in board ${boardId}`);
    return reorderedColumns;
  }

  // Column Rules and WIP Limits
  async validateWipLimit(boardId: string, columnId: string, wipLimit: number | null): Promise<void> {
    if (wipLimit === null) return;

    const cardCount = await this.cardRepo.count({ where: { columnId } });
    if (cardCount > wipLimit) {
      throw new BadRequestException(
        `Cannot set WIP limit to ${wipLimit}. Column currently has ${cardCount} cards.`
      );
    }
  }

  async enforceColumnRules(columnId: string, cardId?: string): Promise<void> {
    const column = await this.getColumnById(columnId);
    
    for (const rule of column.rules) {
      if (!rule.isActive) continue;

      switch (rule.type) {
        case ColumnRuleType.WIP_LIMIT:
          await this.enforceWipLimit(columnId);
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

  private async enforceWipLimit(columnId: string): Promise<void> {
    const column = await this.getColumnById(columnId);
    if (!column.wipLimit) return;

    const cardCount = await this.cardRepo.count({ where: { columnId } });
    if (cardCount > column.wipLimit) {
      throw new BadRequestException(
        `WIP limit exceeded. Column "${column.name}" has ${cardCount} cards but limit is ${column.wipLimit}.`
      );
    }
  }

  private async enforceAutoAssign(cardId: string, rule: ColumnRule): Promise<void> {
    // Implementation would depend on the specific auto-assign logic
    // This is a placeholder for the rule enforcement
    this.logger.debug(`Enforcing auto-assign rule for card ${cardId}: ${rule.condition}`);
  }

  private async enforceAutoMove(cardId: string, rule: ColumnRule): Promise<void> {
    // Implementation would depend on the specific auto-move logic
    // This is a placeholder for the rule enforcement
    this.logger.debug(`Enforcing auto-move rule for card ${cardId}: ${rule.condition}`);
  }

  private async enforceValidation(cardId: string, rule: ColumnRule): Promise<void> {
    // Implementation would depend on the specific validation logic
    // This is a placeholder for the rule enforcement
    this.logger.debug(`Enforcing validation rule for card ${cardId}: ${rule.condition}`);
  }

  // Private Helper Methods
  private async createDefaultColumns(boardId: string): Promise<void> {
    const defaultColumns = [
      { name: 'To Do', color: '#EF4444', order: 1 },
      { name: 'In Progress', color: '#F59E0B', order: 2 },
      { name: 'Review', color: '#3B82F6', order: 3 },
      { name: 'Done', color: '#10B981', order: 4, isCompleted: true },
    ];

    await Promise.all(
      defaultColumns.map(column =>
        this.columnRepo.save(
          this.columnRepo.create({ boardId, ...column })
        )
      )
    );

    await this.updateBoardColumnOrder(boardId);
  }

  private async shiftColumnsOrder(boardId: string, fromOrder: number, shift: number): Promise<void> {
    await this.columnRepo
      .createQueryBuilder()
      .update(Column)
      .set({ order: () => `"order" + ${shift}` })
      .where('boardId = :boardId AND "order" >= :fromOrder', { boardId, fromOrder })
      .execute();
  }

  private async reorderColumn(columnId: string, newOrder: number): Promise<void> {
    const column = await this.getColumnById(columnId);
    const oldOrder = column.order;

    if (oldOrder === newOrder) return;

    if (newOrder > oldOrder) {
      // Moving down: shift columns between old and new position up
      await this.columnRepo
        .createQueryBuilder()
        .update(Column)
        .set({ order: () => '"order" - 1' })
        .where('boardId = :boardId AND "order" > :oldOrder AND "order" <= :newOrder', {
          boardId: column.boardId,
          oldOrder,
          newOrder,
        })
        .execute();
    } else {
      // Moving up: shift columns between new and old position down
      await this.columnRepo
        .createQueryBuilder()
        .update(Column)
        .set({ order: () => '"order" + 1' })
        .where('boardId = :boardId AND "order" >= :newOrder AND "order" < :oldOrder', {
          boardId: column.boardId,
          oldOrder,
          newOrder,
        })
        .execute();
    }

    // Update the moved column
    await this.columnRepo.update(columnId, { order: newOrder });
  }

  private async updateBoardColumnOrder(boardId: string): Promise<void> {
    const columns = await this.columnRepo.find({
      where: { boardId },
      order: { order: 'ASC' },
    });

    const columnOrder = columns.map(c => c.id);

    await this.boardRepo.update(boardId, {
      layout: () => `jsonb_set(layout, '{columnOrder}', '${JSON.stringify(columnOrder)}')`
    } as any);
  }
}