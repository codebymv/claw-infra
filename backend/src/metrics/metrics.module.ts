import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceSnapshot } from '../database/entities/resource-snapshot.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsIngestController } from './metrics-ingest.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceSnapshot, ApiKey])],
  controllers: [MetricsController, MetricsIngestController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
