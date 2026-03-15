import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly redis: Redis;
  private readonly enabled: boolean;
  private readonly ttlHours: number;

  constructor(private readonly config: ConfigService) {
    const redisUrl =
      this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    this.redis = new Redis(redisUrl);
    this.enabled =
      this.config.get<string>('INGEST_IDEMPOTENCY_ENABLED') === 'true';
    this.ttlHours = parseInt(
      this.config.get<string>('INGEST_IDEMPOTENCY_TTL_HOURS') || '24',
      10,
    );
  }

  /**
   * Generate an idempotency key from request data
   * @param data The request data to hash
   * @returns SHA-256 hash of the data
   */
  generateKey(data: Record<string, unknown>): string {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check if a request with this idempotency key has been processed
   * @param key The idempotency key
   * @returns True if the request has been processed
   */
  async isDuplicate(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const exists = await this.redis.exists(`idempotency:${key}`);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Idempotency check failed: ${error.message}`);
      // Fail open - allow the request if Redis is unavailable
      return false;
    }
  }

  /**
   * Mark a request as processed
   * @param key The idempotency key
   */
  async markProcessed(key: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const ttlSeconds = this.ttlHours * 3600;
      await this.redis.setex(`idempotency:${key}`, ttlSeconds, '1');
    } catch (error) {
      this.logger.error(`Failed to mark idempotency key: ${error.message}`);
      // Non-fatal - continue processing
    }
  }

  /**
   * Check and mark in a single atomic operation
   * @param key The idempotency key
   * @returns True if this is a duplicate request
   */
  async checkAndMark(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const ttlSeconds = this.ttlHours * 3600;
      // SET NX (set if not exists) returns 1 if key was set, null if it already existed
      const result = await this.redis.set(
        `idempotency:${key}`,
        '1',
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === null; // null means key already existed (duplicate)
    } catch (error) {
      this.logger.error(`Idempotency check-and-mark failed: ${error.message}`);
      // Fail open - allow the request if Redis is unavailable
      return false;
    }
  }
}
