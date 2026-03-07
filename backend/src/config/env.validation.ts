import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const WEAK_JWT_SECRETS = new Set([
  'changeme-in-production',
  'changeme',
  'secret',
  'default',
  'password',
]);

function assertMinInt(config: ConfigService, name: string, min: number) {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === null || raw === '') return;

  const value = parseInt(raw, 10);
  if (Number.isNaN(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min} when set`);
  }
}

export function validateStartupEnv(config: ConfigService, logger = new Logger('StartupValidation')) {
  const nodeEnv = config.get<string>('NODE_ENV') || 'development';
  const isProd = nodeEnv === 'production';

  const jwtSecret = config.get<string>('JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }

  const isWeakSecret = WEAK_JWT_SECRETS.has(jwtSecret.toLowerCase()) || jwtSecret.length < 32;

  if (isProd && isWeakSecret) {
    throw new Error('JWT_SECRET is too weak for production. Use a strong random value (>= 32 chars).');
  }

  if (!isProd && isWeakSecret) {
    logger.warn('JWT_SECRET is weak for non-production. Use a strong random value to mirror production security.');
  }

  const codeWebhooksEnabled = config.get<string>('CODE_WEBHOOKS_ENABLED') !== 'false';
  if (codeWebhooksEnabled) {
    const webhookSecret = config.get<string>('GITHUB_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Missing required environment variable: GITHUB_WEBHOOK_SECRET (when CODE_WEBHOOKS_ENABLED=true)');
    }

    if (isProd && webhookSecret.length < 16) {
      throw new Error('GITHUB_WEBHOOK_SECRET is too weak for production. Use a strong random value (>= 16 chars).');
    }
  }

  assertMinInt(config, 'RETENTION_SWEEP_INTERVAL_MINUTES', 15);
  assertMinInt(config, 'RETENTION_LOGS_DAYS', 1);
  assertMinInt(config, 'RETENTION_METRICS_RAW_DAYS', 1);
  assertMinInt(config, 'RETENTION_COSTS_DAYS', 30);
  assertMinInt(config, 'RETENTION_CODE_DAILY_DAYS', 90);
  assertMinInt(config, 'INGEST_IDEMPOTENCY_TTL_HOURS', 1);
}
