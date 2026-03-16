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
import { CodeRepo } from '../database/entities/code-repo.entity';
import { CodePr } from '../database/entities/code-pr.entity';
import { CodePrReview } from '../database/entities/code-pr-review.entity';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodeSyncState } from '../database/entities/code-sync-state.entity';
import { CodeDailyMetric } from '../database/entities/code-daily-metric.entity';
import { IdempotencyRecord } from '../database/entities/idempotency-record.entity';
import { ModelPricing } from '../database/entities/model-pricing.entity';
// Project Management Entities
import { Project } from '../database/entities/project.entity';
import { ProjectMember } from '../database/entities/project-member.entity';
import { KanbanBoard } from '../database/entities/kanban-board.entity';
import { Column } from '../database/entities/column.entity';
import { Card } from '../database/entities/card.entity';
import { Comment } from '../database/entities/comment.entity';
import { CardHistory } from '../database/entities/card-history.entity';
import { ChatSession } from '../database/entities/chat-session.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';

export const DATABASE_ENTITIES = [
  AgentRun,
  AgentStep,
  CostRecord,
  ResourceSnapshot,
  AgentLog,
  CostBudget,
  User,
  ApiKey,
  CodeRepo,
  CodePr,
  CodePrReview,
  CodeCommit,
  CodeSyncState,
  CodeDailyMetric,
  IdempotencyRecord,
  ModelPricing,
  // Project Management Entities
  Project,
  ProjectMember,
  KanbanBoard,
  Column,
  Card,
  Comment,
  CardHistory,
  ChatSession,
  ChatMessage,
];

export function buildTypeOrmConfig(
  config: ConfigService,
): TypeOrmModuleOptions {
  const nodeEnv = config.get<string>('NODE_ENV') || 'development';

  // Connection pool configuration
  const poolMax = parseInt(config.get<string>('DB_POOL_MAX') || '20', 10);
  const poolMin = parseInt(config.get<string>('DB_POOL_MIN') || '5', 10);
  const poolIdleTimeout = parseInt(
    config.get<string>('DB_POOL_IDLE_TIMEOUT') || '30000',
    10,
  );
  const connectionTimeout = parseInt(
    config.get<string>('DB_POOL_CONNECTION_TIMEOUT') || '2000',
    10,
  );

  return {
    type: 'postgres',
    url: config.get<string>('DATABASE_URL'),
    entities: DATABASE_ENTITIES,
    synchronize: false,
    migrationsRun: nodeEnv === 'production',
    logging: nodeEnv === 'development',
    ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    migrations: ['dist/database/migrations/*.js'],

    // Connection pool settings
    extra: {
      max: poolMax,
      min: poolMin,
      idleTimeoutMillis: poolIdleTimeout,
      connectionTimeoutMillis: connectionTimeout,
    },
  };
}
