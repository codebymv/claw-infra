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
import { User } from './user.entity';
import { KanbanBoard } from './kanban-board.entity';
import { Column } from './column.entity';
import { Comment } from './comment.entity';
import { CardHistory } from './card-history.entity';
import { AgentRun } from './agent-run.entity';

export enum CardType {
  TASK = 'task',
  FEATURE = 'feature',
  BUG = 'bug',
  EPIC = 'epic',
  STORY = 'story',
}

export enum CardPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum CardStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('cards')
@Index(['boardId', 'columnId'])
@Index(['assigneeId', 'status'])
@Index(['boardId', 'columnId', 'position'])
@Index(['boardId', 'status'])
@Index(['createdAt'])
// Full-text search index
@Index('idx_cards_search', { synchronize: false }) // Will be created in migration
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @TypeOrmColumn({ name: 'board_id', type: 'uuid' })
  boardId: string;

  @ManyToOne(() => KanbanBoard, (board) => board.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board: KanbanBoard;

  @TypeOrmColumn({ name: 'column_id', type: 'uuid' })
  columnId: string;

  @ManyToOne(() => Column, (column) => column.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'column_id' })
  column: Column;

  @TypeOrmColumn({ type: 'varchar', length: 200 })
  title: string;

  @TypeOrmColumn({ type: 'text', nullable: true })
  description: string | null;

  @TypeOrmColumn({ type: 'enum', enum: CardType, default: CardType.TASK })
  type: CardType;

  @TypeOrmColumn({
    type: 'enum',
    enum: CardPriority,
    default: CardPriority.MEDIUM,
  })
  priority: CardPriority;

  @TypeOrmColumn({ type: 'enum', enum: CardStatus, default: CardStatus.OPEN })
  status: CardStatus;

  @TypeOrmColumn({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @TypeOrmColumn({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @TypeOrmColumn({
    name: 'estimated_hours',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  estimatedHours: string | null;

  @TypeOrmColumn({
    name: 'actual_hours',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  actualHours: string | null;

  @TypeOrmColumn({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @TypeOrmColumn({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @TypeOrmColumn({ name: 'custom_fields', type: 'jsonb', default: '{}' })
  customFields: Record<string, any>;

  @TypeOrmColumn({ type: 'int' })
  position: number;

  @TypeOrmColumn({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Comment, (comment) => comment.card)
  comments: Comment[];

  @OneToMany(() => CardHistory, (history) => history.card)
  history: CardHistory[];

  @OneToMany(() => AgentRun, (run) => run.linkedCard)
  agentRuns: AgentRun[];
}
