import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeRepo } from '../database/entities/code-repo.entity';
import { CodePr } from '../database/entities/code-pr.entity';
import { CodePrReview } from '../database/entities/code-pr-review.entity';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodeSyncState } from '../database/entities/code-sync-state.entity';
import { CodeDailyMetric } from '../database/entities/code-daily-metric.entity';
import { CodeController } from './code.controller';
import { CodeService } from './code.service';
import { CodeSyncService } from './code.sync.service';
import { CodeProviderGithub } from './code.provider.github';

@Module({
  imports: [TypeOrmModule.forFeature([CodeRepo, CodePr, CodePrReview, CodeCommit, CodeSyncState, CodeDailyMetric])],
  controllers: [CodeController],
  providers: [CodeService, CodeSyncService, CodeProviderGithub],
  exports: [CodeService],
})
export class CodeModule {}
