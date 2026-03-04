import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { AgentRun } from './agent-run.entity';
import { CostRecord } from './cost-record.entity';
import { AgentLog } from './agent-log.entity';

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('agent_steps')
@Index(['runId'])
@Index(['status'])
export class AgentStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @ManyToOne(() => AgentRun, (run) => run.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AgentRun;

  @Column({ name: 'step_index', type: 'int' })
  stepIndex: number;

  @Column({ name: 'tool_name', type: 'varchar', nullable: true })
  toolName: string | null;

  @Column({ name: 'step_name', type: 'varchar', nullable: true })
  stepName: string | null;

  @Column({ type: 'enum', enum: StepStatus, default: StepStatus.PENDING })
  status: StepStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'input_summary', type: 'text', nullable: true })
  inputSummary: string | null;

  @Column({ name: 'output_summary', type: 'text', nullable: true })
  outputSummary: string | null;

  @Column({ name: 'tokens_in', type: 'int', default: 0 })
  tokensIn: number;

  @Column({ name: 'tokens_out', type: 'int', default: 0 })
  tokensOut: number;

  @Column({ name: 'model_used', type: 'varchar', nullable: true })
  modelUsed: string | null;

  @Column({ name: 'provider', type: 'varchar', nullable: true })
  provider: string | null;

  @Column({ name: 'cost_usd', type: 'decimal', precision: 12, scale: 6, default: 0 })
  costUsd: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => CostRecord, (cost) => cost.step)
  costRecords: CostRecord[];

  @OneToMany(() => AgentLog, (log) => log.step)
  logs: AgentLog[];
}
