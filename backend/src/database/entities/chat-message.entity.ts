import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Project } from './project.entity';
import { ChatSession } from './chat-session.entity';

export enum MessageSource {
  WEB = 'web',
  TELEGRAM = 'telegram',
}

export enum MessageType {
  MESSAGE = 'message',
  COMMAND = 'command',
  RESPONSE = 'response',
  SYSTEM = 'system',
}

export interface MessageMetadata {
  platform: 'web' | 'telegram';
  clientId?: string;
  responseTime?: number;
  error?: boolean;
  formatted?: boolean;
  [key: string]: any;
}

@Entity('chat_messages')
@Index(['sessionId', 'timestamp'])
@Index(['userId', 'timestamp'])
@Index(['source', 'type'])
@Index(['commandId'])
@Index(['projectId', 'timestamp'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ChatSession, (session) => session.messages)
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  timestamp: Date;

  @Column({ type: 'enum', enum: MessageSource })
  source: MessageSource;

  @Column({ type: 'enum', enum: MessageType })
  type: MessageType;

  @Column({ name: 'command_id', type: 'uuid', nullable: true })
  commandId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: MessageMetadata;
}