import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { KanbanBoard } from './kanban-board.entity';
import { ProjectMember } from './project-member.entity';

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

export enum ProjectVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public',
}

export interface ProjectSettings {
  allowAgentAccess: boolean;
  autoArchiveInactiveDays?: number;
  defaultCardTemplate?: string;
  workflowRules: WorkflowRule[];
  notificationSettings: NotificationSettings;
}

export interface WorkflowRule {
  type: string;
  condition: string;
  action: string;
  isActive: boolean;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  webhookEnabled: boolean;
  quietHours?: {
    start: string;
    end: string;
    timezone: string;
  };
}

@Entity('projects')
@Index(['ownerId', 'status'])
@Index(['teamId', 'status'])
@Index(['slug'], { unique: true, where: "status = 'active'" })
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId: string | null;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @Column({
    type: 'enum',
    enum: ProjectVisibility,
    default: ProjectVisibility.PRIVATE,
  })
  visibility: ProjectVisibility;

  @Column({ type: 'jsonb', default: '{}' })
  settings: ProjectSettings;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => KanbanBoard, (board) => board.project)
  boards: KanbanBoard[];

  @OneToMany(() => ProjectMember, (member) => member.project)
  members: ProjectMember[];
}
