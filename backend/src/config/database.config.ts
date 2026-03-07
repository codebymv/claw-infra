import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AgentRun } from '../database/entities/agent-run.entity';
import { AgentStep } from '../database/entities/agent-step.entity';
import { CostRecord } from '../database/entities/cost-record.entity';
import { ResourceSnapshot } from '../database/entities/resource-snapshot.entity';
import { AgentLog } from '../database/entities/agent-log.entity';
import { CostBudget } from '../database/entities/cost-budget.entity';
import { User } from '../database/entities/user.entity';
import { ApiKey } from '../database/entities/api-key.entity';

export const DATABASE_ENTITIES = [
  AgentRun,
  AgentStep,
  CostRecord,
  ResourceSnapshot,
  AgentLog,
  CostBudget,
  User,
  ApiKey,
];

export function buildTypeOrmConfig(config: ConfigService): TypeOrmModuleOptions {
  const nodeEnv = config.get<string>('NODE_ENV') || 'development';

  return {
    type: 'postgres',
    url: config.get<string>('DATABASE_URL'),
    entities: DATABASE_ENTITIES,
    synchronize: false,
    migrationsRun: nodeEnv === 'production',
    logging: nodeEnv === 'development',
    ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    migrations: ['dist/database/migrations/*.js'],
  };
}
