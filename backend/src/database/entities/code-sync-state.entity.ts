import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CodeRepo } from './code-repo.entity';

@Entity('code_sync_state')
@Index(['provider', 'stream', 'repoId'], { unique: true })
export class CodeSyncState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar' })
  stream: string;

  @Column({ name: 'repo_id', type: 'uuid', nullable: true })
  repoId: string | null;

  @ManyToOne(() => CodeRepo, (repo) => repo.syncStates, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repo_id' })
  repo: CodeRepo | null;

  @Column({ name: 'cursor_value', type: 'varchar', nullable: true })
  cursorValue: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
