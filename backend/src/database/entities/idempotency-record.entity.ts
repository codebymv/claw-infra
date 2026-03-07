import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('idempotency_records')
@Index(['keyHash'], { unique: true })
@Index(['expiresAt'])
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'key_hash', type: 'varchar', length: 64 })
  keyHash: string;

  @Column({ type: 'varchar' })
  route: string;

  @Column({ name: 'token_prefix', type: 'varchar', length: 16, nullable: true })
  tokenPrefix: string | null;

  @Column({ name: 'status_code', type: 'int', default: 200 })
  statusCode: number;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
