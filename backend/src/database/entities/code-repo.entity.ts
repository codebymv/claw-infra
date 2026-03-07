import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { CodePr } from './code-pr.entity';
import { CodeCommit } from './code-commit.entity';
import { CodeSyncState } from './code-sync-state.entity';

@Entity('code_repos')
@Index(['provider', 'owner', 'name'], { unique: true })
export class CodeRepo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar' })
  owner: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'default_branch', type: 'varchar', nullable: true })
  defaultBranch: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CodePr, (pr) => pr.repo)
  prs: CodePr[];

  @OneToMany(() => CodeCommit, (commit) => commit.repo)
  commits: CodeCommit[];

  @OneToMany(() => CodeSyncState, (state) => state.repo)
  syncStates: CodeSyncState[];
}
