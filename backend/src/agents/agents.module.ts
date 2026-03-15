import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from '../database/entities/agent-run.entity';
import { AgentStep } from '../database/entities/agent-step.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentIngestController } from './agent-ingest.controller';
import { WsModule } from '../ws/ws.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentStep, ApiKey]),
    WsModule,
    AlertsModule,
    CommonModule,
  ],
  controllers: [AgentsController, AgentIngestController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
