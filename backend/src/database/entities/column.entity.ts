import {
  Entity,
  PrimaryGeneratedColumn,
  Column as TypeOrmColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { KanbanBoard } from './kanban-board.entity';
import { Card } from './card.entity';

export enum ColumnRuleType {
  WIP_LIMIT = 'wip_limit',
  AUTO_ASSIGN = 'auto_assign',
  AUTO_MOVE = 'auto_move',
  VALIDATION = 'validation',
}

export interface ColumnRule {
  type: ColumnRuleType;
  condition: string;
  action: string;
  isActive: boolean;
}

@Entity('columns')
@Index(['boardId'])
@Index(['boardId', 'order'])
export class Column {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @TypeOrmColumn({ name: 'board_id', type: 'uuid' })
  boardId: string;

  @ManyToOne(() => KanbanBoard, (board) => board.columns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board: KanbanBoard;

  @TypeOrmColumn({ type: 'varchar', length: 100 })
  name: string;

  @TypeOrmColumn({ type: 'text', nullable: true })
  description: string | null;

  @TypeOrmColumn({ type: 'varchar', length: 7, default: '#6B7280' })
  color: string;

  @TypeOrmColumn({ type: 'int' })
  order: number;

  @TypeOrmColumn({ name: 'wip_limit', type: 'int', nullable: true })
  wipLimit: number | null;

  @TypeOrmColumn({ name: 'is_completed', type: 'boolean', default: false })
  isCompleted: boolean;

  @TypeOrmColumn({ type: 'jsonb', default: '[]' })
  rules: ColumnRule[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Card, (card) => card.column)
  cards: Card[];
}