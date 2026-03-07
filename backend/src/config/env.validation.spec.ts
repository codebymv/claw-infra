import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateStartupEnv } from './env.validation';

describe('validateStartupEnv', () => {
  const logger = { warn: jest.fn() } as unknown as Logger;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function config(values: Record<string, string | undefined>) {
    return {
      get: (key: string) => values[key],
    } as unknown as ConfigService;
  }

  it('throws when JWT_SECRET is missing', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'development',
          JWT_SECRET: undefined,
          CODE_WEBHOOKS_ENABLED: 'false',
        }),
        logger,
      ),
    ).toThrow('Missing required environment variable: JWT_SECRET');
  });

  it('throws in production when JWT secret is weak', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'production',
          JWT_SECRET: 'changeme-in-production',
          CODE_WEBHOOKS_ENABLED: 'false',
        }),
        logger,
      ),
    ).toThrow('JWT_SECRET is too weak for production. Use a strong random value (>= 32 chars).');
  });

  it('warns in non-production when JWT secret is weak', () => {
    validateStartupEnv(
      config({
        NODE_ENV: 'development',
        JWT_SECRET: 'short',
        CODE_WEBHOOKS_ENABLED: 'false',
      }),
      logger,
    );

    expect((logger.warn as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('throws when webhooks are enabled but webhook secret is missing', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'development',
          JWT_SECRET: '12345678901234567890123456789012',
          CODE_WEBHOOKS_ENABLED: 'true',
          GITHUB_WEBHOOK_SECRET: undefined,
        }),
        logger,
      ),
    ).toThrow('Missing required environment variable: GITHUB_WEBHOOK_SECRET (when CODE_WEBHOOKS_ENABLED=true)');
  });

  it('throws in production when webhook secret is weak', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'production',
          JWT_SECRET: '12345678901234567890123456789012',
          CODE_WEBHOOKS_ENABLED: 'true',
          GITHUB_WEBHOOK_SECRET: 'shortsecret',
        }),
        logger,
      ),
    ).toThrow('GITHUB_WEBHOOK_SECRET is too weak for production. Use a strong random value (>= 16 chars).');
  });

  it('passes with strong secrets', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'production',
          JWT_SECRET: '12345678901234567890123456789012',
          CODE_WEBHOOKS_ENABLED: 'true',
          GITHUB_WEBHOOK_SECRET: '1234567890123456',
        }),
        logger,
      ),
    ).not.toThrow();
  });

  it('throws when retention windows are invalid', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'development',
          JWT_SECRET: '12345678901234567890123456789012',
          CODE_WEBHOOKS_ENABLED: 'false',
          RETENTION_LOGS_DAYS: '0',
        }),
        logger,
      ),
    ).toThrow('RETENTION_LOGS_DAYS must be an integer >= 1 when set');
  });

  it('throws when retention sweep interval is invalid', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'development',
          JWT_SECRET: '12345678901234567890123456789012',
          CODE_WEBHOOKS_ENABLED: 'false',
          RETENTION_SWEEP_INTERVAL_MINUTES: '5',
        }),
        logger,
      ),
    ).toThrow('RETENTION_SWEEP_INTERVAL_MINUTES must be an integer >= 15 when set');
  });

  it('throws when idempotency ttl is invalid', () => {
    expect(() =>
      validateStartupEnv(
        config({
          NODE_ENV: 'development',
          JWT_SECRET: '12345678901234567890123456789012',
          CODE_WEBHOOKS_ENABLED: 'false',
          INGEST_IDEMPOTENCY_TTL_HOURS: '0',
        }),
        logger,
      ),
    ).toThrow('INGEST_IDEMPOTENCY_TTL_HOURS must be an integer >= 1 when set');
  });
});
