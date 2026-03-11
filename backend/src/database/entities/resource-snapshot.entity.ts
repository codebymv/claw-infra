import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AgentRun } from './agent-run.entity';

@Entity('resource_snapshots')
@Index(['runId'])
@Index(['recordedAt'])
@Index(['runId', 'recordedAt']) // Composite for run metrics timeline
export class ResourceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid', nullable: true })
  runId: string | null;

  @ManyToOne(() => AgentRun, (run) => run.resourceSnapshots, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'run_id' })
  run: AgentRun | null;

  @Column({ name: 'cpu_percent', type: 'float', default: 0 })
  cpuPercent: number;

  @Column({ name: 'memory_mb', type: 'float', default: 0 })
  memoryMb: number;

  @Column({ name: 'memory_percent', type: 'float', default: 0 })
  memoryPercent: number;

  @Column({ name: 'disk_io_read_mb', type: 'float', default: 0 })
  diskIoReadMb: number;

  @Column({ name: 'disk_io_write_mb', type: 'float', default: 0 })
  diskIoWriteMb: number;

  @Column({ name: 'network_in_mb', type: 'float', default: 0 })
  networkInMb: number;

  @Column({ name: 'network_out_mb', type: 'float', default: 0 })
  networkOutMb: number;

  @Column({ name: 'active_connections', type: 'int', default: 0 })
  activeConnections: number;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
