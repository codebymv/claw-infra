import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GithubInstallation } from './github-installation.entity';

@Entity('github_repo_grants')
@Index(['installationId', 'repoFullName'], { unique: true })
export class GithubRepoGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'installation_id', type: 'uuid' })
  installationId: string;

  @Column({ name: 'repo_full_name', type: 'varchar' })
  repoFullName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => GithubInstallation, (inst) => inst.repoGrants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'installation_id' })
  installation: GithubInstallation;
}
