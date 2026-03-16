import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { Card } from './card.entity';
import { Comment } from './comment.entity';
import { CardHistory } from './card-history.entity';

export enum UserRole {
  ADMIN = 'admin',
  VIEWER = 'viewer',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  role: UserRole;

  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Project, (project) => project.owner)
  ownedProjects: Project[];

  @OneToMany(() => ProjectMember, (membership) => membership.user)
  projectMemberships: ProjectMember[];

  @OneToMany(() => Card, (card) => card.assignee)
  assignedCards: Card[];

  @OneToMany(() => Card, (card) => card.reporter)
  reportedCards: Card[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];

  @OneToMany(() => CardHistory, (history) => history.user)
  cardHistory: CardHistory[];

  @OneToMany(() => ChatSession, (session) => session.user)
  chatSessions: ChatSession[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  get password(): string {
    return this.passwordHash;
  }

  set password(value: string) {
    this.passwordHash = value;
  }

  get name(): string | null {
    return this.displayName;
  }

  set name(value: string | null) {
    this.displayName = value;
  }
}



