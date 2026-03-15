import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentLog } from '../database/entities/agent-log.entity';
import { ResourceSnapshot } from '../database/entities/resource-snapshot.entity';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CodeDailyMetric } from '../database/entities/code-daily-metric.entity';
import { CommonModule } from '../common/common.module';
import { DataRetentionService } from './data-retention.service';
import { FixViewsController } from './fix-views.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentLog,
      ResourceSnapshot,
      CostRecord,
      CodeDailyMetric,
    ]),
    CommonModule,
  ],
  providers: [DataRetentionService],
  controllers: [FixViewsController],
})
export class MaintenanceModule {}
