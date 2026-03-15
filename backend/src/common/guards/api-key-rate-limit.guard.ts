import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';

@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyRateLimitGuard.name);
  private readonly rateLimit: number;
  private readonly windowMs: number = 60000; // 1 minute
  private readonly exemptAdminKeys: boolean;

  private readonly redis: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    const redisUrl =
      this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
    this.rateLimit = parseInt(
      this.config.get<string>('INGEST_RATE_LIMIT_PER_KEY') || '100',
      10,
    );
    this.exemptAdminKeys =
      this.config.get<string>('ADMIN_API_KEY_EXEMPT') === 'true';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.apiKey; // Set by ApiKeyAuthGuard

    if (!apiKey) {
      // No API key present, skip rate limiting
      return true;
    }

    // Exempt admin keys if configured
    if (this.exemptAdminKeys && apiKey.type === 'admin') {
      return true;
    }

    const key = `rate_limit:api_key:${apiKey.id}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      // Use Redis sorted set to track requests in sliding window
      const multi = this.redis.multi();

      // Remove old entries outside the window
      multi.zremrangebyscore(key, 0, windowStart);

      // Add current request
      multi.zadd(key, now, `${now}:${Math.random()}`);

      // Count requests in window
      multi.zcard(key);

      // Set expiration
      multi.expire(key, Math.ceil(this.windowMs / 1000));

      const results = await multi.exec();

      if (!results) {
        this.logger.warn('Redis multi command failed');
        // Fail open - allow request if Redis unavailable
        return true;
      }

      // Get count from ZCARD result
      const count = results[2][1] as number;

      // Set rate limit headers
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', this.rateLimit);
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.max(0, this.rateLimit - count),
      );
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(now + this.windowMs).toISOString(),
      );

      if (count > this.rateLimit) {
        const retryAfter = Math.ceil(this.windowMs / 1000);
        response.setHeader('Retry-After', retryAfter);

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Rate limit exceeded. Maximum ${this.rateLimit} requests per minute.`,
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Rate limiting error:', error);
      // Fail open - allow request if Redis error
      return true;
    }
  }
}
