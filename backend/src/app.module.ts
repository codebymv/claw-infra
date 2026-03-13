import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { AgentsModule } from './agents/agents.module';
import { MetricsModule } from './metrics/metrics.module';
import { CostsModule } from './costs/costs.module';
import { LogsModule } from './logs/logs.module';
import { WsModule } from './ws/ws.module';
import { AlertsModule } from './alerts/alerts.module';
import { CodeModule } from './code/code.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ProjectsModule } from './projects/projects.module';
import { buildTypeOrmConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildTypeOrmConfig(config),
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
    CodeModule,
    MaintenanceModule,
    ProjectsModule,
  ],
})
export class AppModule { }
