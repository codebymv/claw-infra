import { ConfigService } from '@nestjs/config';
import { getJwtVerificationSecrets, verifyJwtWithConfiguredSecrets } from './jwt-verification.util';
import * as jwt from 'jsonwebtoken';

describe('jwt verification util', () => {
  it('includes signing secret before fallback secrets without duplicates', () => {
    const config = new ConfigService({
      JWT_SIGNING_SECRET: 'signing-secret',
      JWT_SECRETS: 'legacy-a, legacy-b, signing-secret',
      JWT_SECRET: 'primary-secret',
    });

    expect(getJwtVerificationSecrets(config)).toEqual([
      'signing-secret',
      'legacy-a',
      'legacy-b',
      'primary-secret',
    ]);
  });

  it('verifies tokens signed with the dedicated signing secret', () => {
    const config = new ConfigService({
      JWT_SIGNING_SECRET: 'signing-secret',
      JWT_SECRET: 'primary-secret',
    });
    const token = jwt.sign({ sub: 'user-123' }, 'signing-secret');

    expect(verifyJwtWithConfiguredSecrets<{ sub: string }>(token, config)).toMatchObject({
      sub: 'user-123',
    });
  });
});