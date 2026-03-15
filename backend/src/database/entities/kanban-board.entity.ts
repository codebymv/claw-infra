import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { Column as KanbanColumn } from './column.entity';
import { Card } from './card.entity';

export interface SwimLane {
  id: string;
  name: string;
  criteria: FilterCriteria;
  order: number;
}

export interface FilterCriteria {
  field: string;
  operator: string;
  value: any;
}

export interface CustomField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  options?: string[];
  required: boolean;
  defaultValue?: any;
}

export interface BoardFilter {
  id: string;
  name: string;
  criteria: FilterCriteria[];
  isActive: boolean;
}

export interface BoardLayout {
  columnOrder: string[];
  swimLanes?: SwimLane[];
  customFields: CustomField[];
  filters: BoardFilter[];
}

@Entity('kanban_boards')
@Index(['projectId'])
@Index(['projectId', 'isDefault'])
export class KanbanBoard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, (project) => project.boards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  layout: BoardLayout;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => KanbanColumn, (column) => column.board)
  columns: KanbanColumn[];

  @OneToMany(() => Card, (card) => card.board)
  cards: Card[];
}
