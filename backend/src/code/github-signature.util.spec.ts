import { verifyGithubSignature } from './github-signature.util';

describe('verifyGithubSignature', () => {
  const secret = 'super-secret-webhook-key';
  const payload = Buffer.from(JSON.stringify({ action: 'opened', number: 42 }));

  it('accepts valid sha256 signatures', () => {
    const crypto = require('crypto') as typeof import('crypto');
    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const result = verifyGithubSignature(payload, `sha256=${digest}`, secret);

    expect(result.valid).toBe(true);
    expect(result.algorithm).toBe('sha256');
  });

  it('accepts valid sha1 signatures', () => {
    const crypto = require('crypto') as typeof import('crypto');
    const digest = crypto.createHmac('sha1', secret).update(payload).digest('hex');

    const result = verifyGithubSignature(payload, `sha1=${digest}`, secret);

    expect(result.valid).toBe(true);
    expect(result.algorithm).toBe('sha1');
  });

  it('rejects invalid signature values', () => {
    const result = verifyGithubSignature(payload, 'sha256=deadbeef', secret);
    expect(result.valid).toBe(false);
  });

  it('rejects unsupported signature algorithms', () => {
    const result = verifyGithubSignature(payload, 'md5=abcd', secret);
    expect(result.valid).toBe(false);
    expect(result.algorithm).toBe(null);
  });
});
