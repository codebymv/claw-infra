import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export function getJwtVerificationSecrets(config: ConfigService): string[] {
  const configured = [
    config.get<string>('JWT_SIGNING_SECRET'),
    ...(config.get<string>('JWT_SECRETS') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    config.get<string>('JWT_SECRET'),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(configured));
}

export function verifyJwtWithConfiguredSecrets<T>(
  token: string,
  config: ConfigService,
): T {
  const secrets = getJwtVerificationSecrets(config);

  if (secrets.length === 0) {
    throw new Error('No JWT verification secrets configured');
  }

  let lastError: unknown;

  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('JWT verification failed');
}