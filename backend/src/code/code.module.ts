import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CodeRepo } from '../database/entities/code-repo.entity';
import { CodePr } from '../database/entities/code-pr.entity';
import { CodePrReview } from '../database/entities/code-pr-review.entity';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodeSyncState } from '../database/entities/code-sync-state.entity';
import { CodeDailyMetric } from '../database/entities/code-daily-metric.entity';
import { GithubInstallation } from '../database/entities/github-installation.entity';
import { GithubRepoGrant } from '../database/entities/github-repo-grant.entity';
import { CodeController } from './code.controller';
import { GithubAppController } from './github-app.controller';
import { CodeService } from './code.service';
import { CodeSyncService } from './code.sync.service';
import { CodeProviderGithub } from './code.provider.github';
import { GithubAppService } from './github-app.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      CodeRepo,
      CodePr,
      CodePrReview,
      CodeCommit,
      CodeSyncState,
      CodeDailyMetric,
      GithubInstallation,
      GithubRepoGrant,
    ]),
  ],
  controllers: [CodeController, GithubAppController],
  providers: [CodeService, CodeSyncService, CodeProviderGithub, GithubAppService],
  exports: [CodeService, GithubAppService],
})
export class CodeModule {}
