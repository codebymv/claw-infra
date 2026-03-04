import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AgentRun } from './agent-run.entity';
import { AgentStep } from './agent-step.entity';

@Entity('cost_records')
@Index(['runId'])
@Index(['recordedAt'])
@Index(['provider'])
@Index(['model'])
export class CostRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @ManyToOne(() => AgentRun, (run) => run.costRecords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AgentRun;

  @Column({ name: 'step_id', type: 'uuid', nullable: true })
  stepId: string | null;

  @ManyToOne(() => AgentStep, (step) => step.costRecords, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'step_id' })
  step: AgentStep | null;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar' })
  model: string;

  @Column({ name: 'tokens_in', type: 'int', default: 0 })
  tokensIn: number;

  @Column({ name: 'tokens_out', type: 'int', default: 0 })
  tokensOut: number;

  @Column({ name: 'cost_usd', type: 'decimal', precision: 12, scale: 6 })
  costUsd: string;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
