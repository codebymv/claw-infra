import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cost_budgets')
export class CostBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_name', type: 'varchar', nullable: true })
  agentName: string | null;

  @Column({ name: 'daily_limit_usd', type: 'decimal', precision: 12, scale: 2, nullable: true })
  dailyLimitUsd: string | null;

  @Column({ name: 'monthly_limit_usd', type: 'decimal', precision: 12, scale: 2, nullable: true })
  monthlyLimitUsd: string | null;

  @Column({ name: 'alert_threshold_percent', type: 'int', default: 80 })
  alertThresholdPercent: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
