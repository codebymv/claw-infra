import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentLog } from '../database/entities/agent-log.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { LogsIngestController } from './logs-ingest.controller';
import { WsModule } from '../ws/ws.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([AgentLog, ApiKey]), WsModule, CommonModule],
  controllers: [LogsController, LogsIngestController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
