import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export class CryptoUtil {
  /**
   * Generate HMAC-SHA256 hash of an API key
   * @param key The raw API key
   * @param secret The HMAC secret from environment
   * @returns Hex-encoded HMAC hash
   */
  static hmacHash(key: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(key)
      .digest('hex');
  }

  /**
   * Validate an API key against its stored HMAC hash using constant-time comparison
   * @param providedKey The API key provided in the request
   * @param storedHash The HMAC hash stored in the database
   * @param secret The HMAC secret from environment
   * @returns True if the key is valid
   */
  static validateHmac(providedKey: string, storedHash: string, secret: string): boolean {
    const computedHash = this.hmacHash(providedKey, secret);
    
    // Use timing-safe comparison to prevent timing attacks
    try {
      const computedBuffer = Buffer.from(computedHash, 'hex');
      const storedBuffer = Buffer.from(storedHash, 'hex');
      
      if (computedBuffer.length !== storedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(computedBuffer, storedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Generate a cryptographically secure random API key
   * @param bytes Number of random bytes (default 32)
   * @returns Hex-encoded random key
   */
  static generateApiKey(bytes: number = 32): string {
    return randomBytes(bytes).toString('hex');
  }
}
