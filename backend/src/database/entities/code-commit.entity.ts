import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CodeRepo } from './code-repo.entity';
import { CodePr } from './code-pr.entity';

@Entity('code_commits')
@Index(['sha'], { unique: true })
@Index(['repoId'])
@Index(['prId'])
@Index(['author'])
@Index(['committedAt'])
export class CodeCommit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'repo_id', type: 'uuid' })
  repoId: string;

  @ManyToOne(() => CodeRepo, (repo) => repo.commits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repo_id' })
  repo: CodeRepo;

  @Column({ name: 'pr_id', type: 'uuid', nullable: true })
  prId: string | null;

  @ManyToOne(() => CodePr, (pr) => pr.commits, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pr_id' })
  pr: CodePr | null;

  @Column({ type: 'varchar' })
  sha: string;

  @Column({ type: 'varchar', nullable: true })
  author: string | null;

  @Column({ name: 'committed_at', type: 'timestamptz' })
  committedAt: Date;

  @Column({ type: 'int', default: 0 })
  additions: number;

  @Column({ type: 'int', default: 0 })
  deletions: number;

  @Column({ name: 'files_changed', type: 'int', default: 0 })
  filesChanged: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
