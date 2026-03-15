import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('code_daily_metrics')
@Index(['day', 'repoId', 'author'], { unique: true })
export class CodeDailyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  day: string;

  @Column({ name: 'repo_id', type: 'uuid', nullable: true })
  repoId: string | null;

  @Column({ type: 'varchar', nullable: true })
  author: string | null;

  @Column({ name: 'prs_opened', type: 'int', default: 0 })
  prsOpened: number;

  @Column({ name: 'prs_merged', type: 'int', default: 0 })
  prsMerged: number;

  @Column({ type: 'int', default: 0 })
  commits: number;

  @Column({ type: 'int', default: 0 })
  additions: number;

  @Column({ type: 'int', default: 0 })
  deletions: number;

  @Column({ name: 'changed_files', type: 'int', default: 0 })
  changedFiles: number;

  @Column({ name: 'merge_latency_seconds_total', type: 'bigint', default: 0 })
  mergeLatencySecondsTotal: string;

  @Column({ name: 'merge_latency_count', type: 'int', default: 0 })
  mergeLatencyCount: number;

  @Column({
    name: 'first_review_latency_seconds_total',
    type: 'bigint',
    default: 0,
  })
  firstReviewLatencySecondsTotal: string;

  @Column({ name: 'first_review_latency_count', type: 'int', default: 0 })
  firstReviewLatencyCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
