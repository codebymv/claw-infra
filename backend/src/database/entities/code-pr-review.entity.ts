import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CodePr } from './code-pr.entity';

export enum CodePrReviewState {
  APPROVED = 'APPROVED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  COMMENTED = 'COMMENTED',
  DISMISSED = 'DISMISSED',
  PENDING = 'PENDING',
}

@Entity('code_pr_reviews')
@Index(['prId'])
@Index(['reviewer'])
@Index(['submittedAt'])
@Index(['externalId'], { unique: true })
export class CodePrReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pr_id', type: 'uuid' })
  prId: string;

  @ManyToOne(() => CodePr, (pr) => pr.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pr_id' })
  pr: CodePr;

  @Column({ name: 'external_id', type: 'varchar' })
  externalId: string;

  @Column({ type: 'varchar', nullable: true })
  reviewer: string | null;

  @Column({ type: 'enum', enum: CodePrReviewState })
  state: CodePrReviewState;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
