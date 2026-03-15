import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostRecord } from '../database/entities/cost-record.entity';
import { CostBudget } from '../database/entities/cost-budget.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { ModelPricing } from '../database/entities/model-pricing.entity';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { CostIngestController } from './cost-ingest.controller';
import { CostRefreshService } from './cost-refresh.service';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CostRecord, CostBudget, ApiKey, ModelPricing]),
    CommonModule,
  ],
  controllers: [CostsController, CostIngestController, PricingController],
  providers: [CostsService, CostRefreshService, PricingService],
  exports: [CostsService, PricingService],
})
export class CostsModule {}
