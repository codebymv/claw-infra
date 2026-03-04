import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ApiKeyType {
  AGENT = 'agent',
  DASHBOARD = 'dashboard',
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Index({ unique: true })
  @Column({ name: 'key_hash', type: 'varchar' })
  keyHash: string;

  @Column({ name: 'key_prefix', length: 8 })
  keyPrefix: string;

  @Column({ type: 'enum', enum: ApiKeyType, default: ApiKeyType.AGENT })
  type: ApiKeyType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
