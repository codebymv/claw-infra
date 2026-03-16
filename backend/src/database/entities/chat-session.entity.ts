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
import { Project } from './project.entity';
import { ChatMessage } from './chat-message.entity';

export interface ChatSessionPreferences {
  autoComplete: boolean;
  showTimestamps: boolean;
  markdownEnabled: boolean;
  crossPlatformSync: boolean;
}

export interface ActiveProjectInfo {
  projectId: string;
  projectName: string;
  selectedAt: Date;
}

@Entity('chat_sessions')
@Index(['userId'], { unique: true })
@Index(['lastActivity'])
@Index(['activeProjectId'])
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'last_activity', type: 'timestamptz', default: () => 'NOW()' })
  lastActivity: Date;

  @Column({ name: 'message_count', type: 'integer', default: 0 })
  messageCount: number;

  @Column({ name: 'active_project_id', type: 'uuid', nullable: true })
  activeProjectId: string | null;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'active_project_id' })
  activeProject: Project | null;

  @Column({ type: 'jsonb', default: '{}' })
  preferences: ChatSessionPreferences;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @OneToMany(() => ChatMessage, (message) => message.session)
  messages: ChatMessage[];
}