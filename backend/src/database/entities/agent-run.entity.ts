import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AgentStep } from './agent-step.entity';
import { CostRecord } from './cost-record.entity';
import { ResourceSnapshot } from './resource-snapshot.entity';
import { AgentLog } from './agent-log.entity';

export enum AgentRunStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum AgentRunTrigger {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  WEBHOOK = 'webhook',
  API = 'api',
}

@Entity('agent_runs')
@Index(['status'])
@Index(['agentName'])
@Index(['startedAt'])
@Index(['agentName', 'status', 'startedAt']) // Composite for filtered queries
@Index(['status', 'startedAt']) // Composite for active runs timeline
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_name', type: 'varchar' })
  agentName: string;

  @Column({ type: 'enum', enum: AgentRunStatus, default: AgentRunStatus.QUEUED })
  status: AgentRunStatus;

  @Column({ type: 'enum', enum: AgentRunTrigger, default: AgentRunTrigger.MANUAL })
  trigger: AgentRunTrigger;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'config_snapshot', type: 'jsonb', nullable: true })
  configSnapshot: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'parent_run_id', type: 'uuid', nullable: true })
  parentRunId: string | null;

  @ManyToOne(() => AgentRun, { nullable: true })
  @JoinColumn({ name: 'parent_run_id' })
  parentRun: AgentRun | null;

  @Column({ name: 'total_tokens_in', type: 'int', default: 0 })
  totalTokensIn: number;

  @Column({ name: 'total_tokens_out', type: 'int', default: 0 })
  totalTokensOut: number;

  @Column({ name: 'total_cost_usd', type: 'decimal', precision: 12, scale: 6, default: 0 })
  totalCostUsd: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => AgentStep, (step) => step.run)
  steps: AgentStep[];

  @OneToMany(() => CostRecord, (cost) => cost.run)
  costRecords: CostRecord[];

  @OneToMany(() => ResourceSnapshot, (snap) => snap.run)
  resourceSnapshots: ResourceSnapshot[];

  @OneToMany(() => AgentLog, (log) => log.run)
  logs: AgentLog[];
}
