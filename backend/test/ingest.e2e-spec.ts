import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AgentRun, AgentRunStatus } from '../src/database/entities/agent-run.entity';
import { AgentStep } from '../src/database/entities/agent-step.entity';
import { ApiKey, ApiKeyType } from '../src/database/entities/api-key.entity';
import { User } from '../src/database/entities/user.entity';
import { randomUUID } from 'crypto';

describe('Ingest API Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let agentApiKey: ApiKey;
  let userApiKey: ApiKey;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
          load: [() => ({
            DATABASE_URL: 'postgresql://test:test@localhost:5432/claw_test',
            REDIS_URL: 'redis://localhost:6379',
            JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long',
            FRONTEND_URL: 'http://localhost:3001',
            NODE_ENV: 'test',
          })],
        }),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            type: 'postgres',
            url: 'postgresql://test:test@localhost:5432/claw_test',
            synchronize: true,
            dropSchema: true,
            entities: [AgentRun, AgentStep, ApiKey, User],
          }),
        }),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60000, limit: 1000 },
          { name: 'auth', ttl: 900000, limit: 1000 },
          { name: 'ingest', ttl: 60000, limit: 1000 },
        ]),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);

    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

    await app.init();

    const testUser = dataSource.getRepository(User).create({
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'admin',
    });
    await dataSource.getRepository(User).save(testUser);

    agentApiKey = dataSource.getRepository(ApiKey).create({
      name: 'Test Agent Key',
      type: ApiKeyType.AGENT,
      keyHash: 'test-agent-key-hash-32-chars-min!',
      keyPrefix: 'tag_',
      userId: testUser.id,
    });
    await dataSource.getRepository(ApiKey).save(agentApiKey);

    userApiKey = dataSource.getRepository(ApiKey).create({
      name: 'Test User Key',
      type: ApiKeyType.USER,
      keyHash: 'test-user-key-hash-32-chars-minimum!',
      keyPrefix: 'tuk_',
      userId: testUser.id,
    });
    await dataSource.getRepository(ApiKey).save(userApiKey);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE agent_runs, agent_steps CASCADE');
  });

  describe('POST /api/ingest/runs', () => {
    it('should create a run with valid agent API key', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          agentName: 'test-agent',
          trigger: 'manual',
          metadata: { test: true },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.agentName).toBe('test-agent');
      expect(response.body.status).toBe('queued');
    });

    it('should reject request without API key', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .send({
          agentName: 'test-agent',
        })
        .expect(401);
    });

    it('should reject request with user API key (wrong type)', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-user-key-hash-32-chars-minimum!')
        .send({
          agentName: 'test-agent',
        })
        .expect(403);
    });

    it('should validate required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({})
        .expect(400);
    });

    it('should handle idempotency keys for duplicate prevention', async () => {
      const idempotencyKey = randomUUID();

      const response1 = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({
          agentName: 'test-agent',
        })
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({
          agentName: 'test-agent',
        })
        .expect(201);

      expect(response2.body.id).toBe(response1.body.id);
    });
  });

  describe('POST /api/ingest/runs/:id/start', () => {
    let runId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          agentName: 'test-agent',
        });
      runId = response.body.id;
    });

    it('should start a queued run', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/ingest/runs/${runId}/start`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .expect(201);

      expect(response.body.status).toBe('running');
      expect(response.body.startedAt).toBeDefined();
    });

    it('should reject starting an already running run', async () => {
      await request(app.getHttpServer())
        .post(`/api/ingest/runs/${runId}/start`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/ingest/runs/${runId}/start`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .expect(400);
    });
  });

  describe('PATCH /api/ingest/runs/:id/status', () => {
    let runId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          agentName: 'test-agent',
        });
      runId = response.body.id;

      await request(app.getHttpServer())
        .post(`/api/ingest/runs/${runId}/start`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!');
    });

    it('should complete a running run', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/ingest/runs/${runId}/status`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          status: 'completed',
          durationMs: 5000,
          totalTokensIn: 1000,
          totalTokensOut: 500,
          totalCostUsd: '0.0050',
        })
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(response.body.durationMs).toBe(5000);
    });

    it('should handle run failure with error message', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/ingest/runs/${runId}/status`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          status: 'failed',
          errorMessage: 'Something went wrong',
        })
        .expect(200);

      expect(response.body.status).toBe('failed');
      expect(response.body.errorMessage).toBe('Something went wrong');
    });
  });

  describe('POST /api/ingest/runs/:runId/steps', () => {
    let runId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          agentName: 'test-agent',
        });
      runId = response.body.id;

      await request(app.getHttpServer())
        .post(`/api/ingest/runs/${runId}/start`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!');
    });

    it('should create a step in a running run', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/ingest/runs/${runId}/steps`)
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          stepIndex: 0,
          toolName: 'web_search',
          stepName: 'Search for information',
          inputSummary: 'Querying API...',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.stepIndex).toBe(0);
      expect(response.body.status).toBe('pending');
    });
  });

  describe('POST /api/ingest/costs', () => {
    let runId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          agentName: 'test-agent',
        });
      runId = response.body.id;
    });

    it('should record a cost event', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/costs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          runId,
          provider: 'openai',
          model: 'gpt-4',
          tokensIn: 1000,
          tokensOut: 500,
          costUsd: '0.0150',
        })
        .expect(201);
    });
  });

  describe('POST /api/ingest/logs', () => {
    let runId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingest/runs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          agentName: 'test-agent',
        });
      runId = response.body.id;
    });

    it('should send a log entry', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/logs')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          runId,
          level: 'info',
          message: 'Test log message',
          metadata: { source: 'test' },
        })
        .expect(201);
    });

    it('should send batch logs', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/logs/batch')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          logs: [
            { runId, level: 'info', message: 'Log 1' },
            { runId, level: 'warn', message: 'Log 2' },
            { runId, level: 'error', message: 'Log 3' },
          ],
        })
        .expect(201);
    });
  });

  describe('POST /api/ingest/metrics', () => {
    it('should send resource metrics', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/metrics')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          cpuPercent: 45.5,
          memoryMb: 512,
          memoryPercent: 25.0,
        })
        .expect(201);
    });

    it('should accept metrics without runId', async () => {
      await request(app.getHttpServer())
        .post('/api/ingest/metrics')
        .set('X-Agent-Token', 'test-agent-key-hash-32-chars-min!')
        .send({
          cpuPercent: 10,
          memoryMb: 256,
          memoryPercent: 12,
        })
        .expect(201);
    });
  });
});