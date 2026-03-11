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

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

@Entity('agent_logs')
@Index(['runId'])
@Index(['level'])
@Index(['createdAt'])
@Index(['runId', 'level', 'createdAt']) // Composite for filtered log queries
@Index(['runId', 'createdAt']) // Composite for run log timeline
export class AgentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @ManyToOne(() => AgentRun, (run) => run.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AgentRun;

  @Column({ name: 'step_id', type: 'uuid', nullable: true })
  stepId: string | null;

  @ManyToOne(() => AgentStep, (step) => step.logs, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'step_id' })
  step: AgentStep | null;

  @Column({ type: 'enum', enum: LogLevel, default: LogLevel.INFO })
  level: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
