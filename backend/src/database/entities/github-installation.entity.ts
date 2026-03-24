import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { GithubRepoGrant } from './github-repo-grant.entity';

@Entity('github_installations')
@Index(['installationId'], { unique: true })
export class GithubInstallation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'installation_id', type: 'bigint' })
  installationId: number;

  @Column({ name: 'account_login', type: 'varchar' })
  accountLogin: string;

  @Column({ name: 'account_type', type: 'varchar', default: 'User' })
  accountType: string;

  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => GithubRepoGrant, (grant) => grant.installation)
  repoGrants: GithubRepoGrant[];
}
