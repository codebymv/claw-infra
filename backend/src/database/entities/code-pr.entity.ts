import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { CodeRepo } from './code-repo.entity';
import { CodePrReview } from './code-pr-review.entity';
import { CodeCommit } from './code-commit.entity';

export enum CodePrState {
  OPEN = 'open',
  CLOSED = 'closed',
  MERGED = 'merged',
}

@Entity('code_prs')
@Index(['repoId', 'number'], { unique: true })
@Index(['state'])
@Index(['author'])
@Index(['openedAt'])
@Index(['mergedAt'])
export class CodePr {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'repo_id', type: 'uuid' })
  repoId: string;

  @ManyToOne(() => CodeRepo, (repo) => repo.prs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repo_id' })
  repo: CodeRepo;

  @Column({ name: 'external_id', type: 'varchar' })
  externalId: string;

  @Column({ type: 'int' })
  number: number;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  author: string | null;

  @Column({ type: 'enum', enum: CodePrState, default: CodePrState.OPEN })
  state: CodePrState;

  @Column({ type: 'boolean', default: false })
  draft: boolean;

  @Column({ type: 'simple-array', default: '' })
  labels: string[];

  @Column({ type: 'int', default: 0 })
  additions: number;

  @Column({ type: 'int', default: 0 })
  deletions: number;

  @Column({ name: 'changed_files', type: 'int', default: 0 })
  changedFiles: number;

  @Column({ name: 'opened_at', type: 'timestamptz' })
  openedAt: Date;

  @Column({ name: 'first_review_at', type: 'timestamptz', nullable: true })
  firstReviewAt: Date | null;

  @Column({ name: 'merged_at', type: 'timestamptz', nullable: true })
  mergedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'merged_by', type: 'varchar', nullable: true })
  mergedBy: string | null;

  @Column({ name: 'created_at_provider', type: 'timestamptz', nullable: true })
  createdAtProvider: Date | null;

  @Column({ name: 'updated_at_provider', type: 'timestamptz', nullable: true })
  updatedAtProvider: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CodePrReview, (review) => review.pr)
  reviews: CodePrReview[];

  @OneToMany(() => CodeCommit, (commit) => commit.pr)
  commits: CodeCommit[];
}
