import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';
import { User } from './user.entity';
import { ProjectMember } from './project-member.entity';
import { KanbanBoard } from './kanban-board.entity';

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

export enum ProjectVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export interface ProjectSettings {
  allowAgentAccess?: boolean;
  autoArchiveInactiveDays?: number;
  defaultCardTemplate?: string;
  workflowRules?: any[];
  notificationSettings?: Record<string, any>;
  [key: string]: any;
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.ownedProjects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId: string | null;

  @Column({ type: 'varchar', default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @Column({ type: 'varchar', default: ProjectVisibility.PRIVATE })
  visibility: ProjectVisibility;

  @Column({ type: 'jsonb', default: '{}' })
  settings: ProjectSettings;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @OneToMany(() => ProjectMember, (member) => member.project)
  members: ProjectMember[];

  @OneToMany(() => KanbanBoard, (board) => board.project)
  boards: KanbanBoard[];

  @OneToMany(() => ChatSession, (session) => session.activeProject)
  chatSessions: ChatSession[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  get metadata(): ProjectSettings {
    return this.settings;
  }

  set metadata(value: ProjectSettings) {
    this.settings = value;
  }
}
