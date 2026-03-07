import { createHmac, timingSafeEqual } from 'crypto';

function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function verifyGithubSignature(
  payload: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): { valid: boolean; algorithm: 'sha256' | 'sha1' | null } {
  if (!signatureHeader || !secret) {
    return { valid: false, algorithm: null };
  }

  const [prefix, provided] = signatureHeader.split('=');
  if (!prefix || !provided) {
    return { valid: false, algorithm: null };
  }

  if (prefix === 'sha256') {
    const digest = createHmac('sha256', secret).update(payload).digest('hex');
    return { valid: safeEqualHex(digest, provided), algorithm: 'sha256' };
  }

  if (prefix === 'sha1') {
    const digest = createHmac('sha1', secret).update(payload).digest('hex');
    return { valid: safeEqualHex(digest, provided), algorithm: 'sha1' };
  }

  return { valid: false, algorithm: null };
}
