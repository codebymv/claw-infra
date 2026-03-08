import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CostBudget } from '../database/entities/cost-budget.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { CostIngestController } from './cost-ingest.controller';
import { CommonModule } from '../common/common.module';
import { OpenRouterProvider } from './costs.provider.openrouter';
import { CostsSyncService } from './costs.sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([CostRecord, CostBudget, ApiKey]), CommonModule],
  controllers: [CostsController, CostIngestController],
  providers: [CostsService, OpenRouterProvider, CostsSyncService],
  exports: [CostsService],
})
export class CostsModule { }
