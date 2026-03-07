import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const WEAK_JWT_SECRETS = new Set([
  'changeme-in-production',
  'changeme',
  'secret',
  'default',
  'password',
]);

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
}
