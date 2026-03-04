import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CostBudget } from '../database/entities/cost-budget.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { CostIngestController } from './cost-ingest.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CostRecord, CostBudget, ApiKey])],
  controllers: [CostsController, CostIngestController],
  providers: [CostsService],
  exports: [CostsService],
})
export class CostsModule {}
