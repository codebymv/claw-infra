import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AgentsModule } from './agents/agents.module';
import { MetricsModule } from './metrics/metrics.module';
import { CostsModule } from './costs/costs.module';
import { LogsModule } from './logs/logs.module';
import { WsModule } from './ws/ws.module';
import { AlertsModule } from './alerts/alerts.module';
import { AgentRun } from './database/entities/agent-run.entity';
import { AgentStep } from './database/entities/agent-step.entity';
import { CostRecord } from './database/entities/cost-record.entity';
import { ResourceSnapshot } from './database/entities/resource-snapshot.entity';
import { AgentLog } from './database/entities/agent-log.entity';
import { CostBudget } from './database/entities/cost-budget.entity';
import { User } from './database/entities/user.entity';
import { ApiKey } from './database/entities/api-key.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [AgentRun, AgentStep, CostRecord, ResourceSnapshot, AgentLog, CostBudget, User, ApiKey],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
        ssl: config.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      }),
    }),

    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 60,
      },
      {
        name: 'auth',
        ttl: 900000,
        limit: 5,
      },
      {
        name: 'ingest',
        ttl: 60000,
        limit: 30,
      },
    ]),

    AuthModule,
    AgentsModule,
    MetricsModule,
    CostsModule,
    LogsModule,
    WsModule,
    AlertsModule,
  ],
})
export class AppModule {}
