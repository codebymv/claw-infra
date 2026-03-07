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
    expect(() => validateStartupEnv(config({ NODE_ENV: 'development', JWT_SECRET: undefined }), logger)).toThrow(
      'Missing required environment variable: JWT_SECRET',
    );
  });

  it('throws in production when JWT secret is weak', () => {
    expect(() =>
      validateStartupEnv(config({ NODE_ENV: 'production', JWT_SECRET: 'changeme-in-production' }), logger),
    ).toThrow('JWT_SECRET is too weak for production. Use a strong random value (>= 32 chars).');
  });

  it('warns in non-production when JWT secret is weak', () => {
    validateStartupEnv(config({ NODE_ENV: 'development', JWT_SECRET: 'short' }), logger);
    expect((logger.warn as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('passes with strong secret', () => {
    expect(() =>
      validateStartupEnv(
        config({ NODE_ENV: 'production', JWT_SECRET: '12345678901234567890123456789012' }),
        logger,
      ),
    ).not.toThrow();
  });
});
