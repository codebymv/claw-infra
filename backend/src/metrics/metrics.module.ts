import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceSnapshot } from '../database/entities/resource-snapshot.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsIngestController } from './metrics-ingest.controller';
import { WsModule } from '../ws/ws.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceSnapshot, ApiKey]),
    WsModule,
    CommonModule,
  ],
  controllers: [MetricsController, MetricsIngestController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
