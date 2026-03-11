import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('model_pricing')
export class ModelPricing {
  @PrimaryColumn({ name: 'provider', type: 'varchar', length: 100 })
  provider: string;

  @PrimaryColumn({ name: 'model', type: 'varchar', length: 200 })
  model: string;

  @PrimaryColumn({ name: 'effective_date', type: 'timestamp with time zone' })
  effectiveDate: Date;

  @Column({ name: 'input_price_per_million', type: 'decimal', precision: 12, scale: 6 })
  inputPricePerMillion: string;

  @Column({ name: 'output_price_per_million', type: 'decimal', precision: 12, scale: 6 })
  outputPricePerMillion: string;

  @Column({ name: 'cache_discount', type: 'decimal', precision: 5, scale: 4, default: '1.0000' })
  cacheDiscount: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
