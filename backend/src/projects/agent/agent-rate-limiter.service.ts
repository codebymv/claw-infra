import { Injectable, Logger } from '@nestjs/common';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: Date;
  firstRequest: Date;
}

@Injectable()
export class AgentRateLimiterService {
  private readonly logger = new Logger(AgentRateLimiterService.name);
  private readonly limits = new Map<string, RateLimitEntry>();

  // Default rate limit configurations
  private readonly configs: Record<string, RateLimitConfig> = {
    // Per-agent limits
    'agent:requests': { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute
    'agent:batch': { windowMs: 60 * 1000, maxRequests: 10 }, // 10 batch operations per minute
    'agent:workspace': { windowMs: 60 * 1000, maxRequests: 5 }, // 5 workspace operations per minute
    
    // Per-project limits
    'project:requests': { windowMs: 60 * 1000, maxRequests: 500 }, // 500 requests per minute per project
    'project:cards': { windowMs: 60 * 1000, maxRequests: 200 }, // 200 card operations per minute per project
    
    // Global limits
    'global:requests': { windowMs: 60 * 1000, maxRequests: 1000 }, // 1000 requests per minute globally
  };

  async checkLimit(
    key: string,
    limitType: string,
    customConfig?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const config = { ...this.configs[limitType], ...customConfig };
    if (!config) {
      // No limit configured, allow request
      return {
        allowed: true,
        remaining: Infinity,
        resetTime: new Date(Date.now() + 60 * 1000),
        totalHits: 0,
      };
    }

    const now = new Date();
    const limitKey = `${limitType}:${key}`;
    const entry = this.limits.get(limitKey);

    if (!entry || now.getTime() >= entry.resetTime.getTime()) {
      // First request or window expired, create new entry
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: new Date(now.getTime() + config.windowMs),
        firstRequest: now,
      };
      this.limits.set(limitKey, newEntry);

      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: newEntry.resetTime,
        totalHits: 1,
      };
    }

    // Increment counter
    entry.count++;

    const allowed = entry.count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    if (!allowed) {
      this.logger.warn(`Rate limit exceeded for ${limitKey}: ${entry.count}/${config.maxRequests}`);
    }

    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
      totalHits: entry.count,
    };
  }

  async checkAgentLimit(agentId: string, operation: string): Promise<RateLimitResult> {
    return this.checkLimit(agentId, `agent:${operation}`);
  }

  async checkProjectLimit(projectId: string, operation: string): Promise<RateLimitResult> {
    return this.checkLimit(projectId, `project:${operation}`);
  }

  async checkGlobalLimit(operation: string): Promise<RateLimitResult> {
    return this.checkLimit('global', `global:${operation}`);
  }

  async checkMultipleLimits(checks: Array<{
    key: string;
    limitType: string;
    config?: Partial<RateLimitConfig>;
  }>): Promise<{
    allowed: boolean;
    results: RateLimitResult[];
    mostRestrictive: RateLimitResult;
  }> {
    const results: RateLimitResult[] = [];
    let allowed = true;
    let mostRestrictive: RateLimitResult | null = null;

    for (const check of checks) {
      const result = await this.checkLimit(check.key, check.limitType, check.config);
      results.push(result);

      if (!result.allowed) {
        allowed = false;
      }

      if (!mostRestrictive || result.remaining < mostRestrictive.remaining) {
        mostRestrictive = result;
      }
    }

    return {
      allowed,
      results,
      mostRestrictive: mostRestrictive!,
    };
  }

  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.totalHits.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime.getTime() / 1000).toString(),
    };
  }

  updateConfig(limitType: string, config: RateLimitConfig): void {
    this.configs[limitType] = config;
    this.logger.log(`Updated rate limit config for ${limitType}: ${config.maxRequests}/${config.windowMs}ms`);
  }

  getStats(): {
    totalKeys: number;
    activeWindows: number;
    configs: Record<string, RateLimitConfig>;
  } {
    const now = new Date();
    const activeWindows = Array.from(this.limits.values()).filter(
      entry => now.getTime() < entry.resetTime.getTime()
    ).length;

    return {
      totalKeys: this.limits.size,
      activeWindows,
      configs: { ...this.configs },
    };
  }

  cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (now.getTime() >= entry.resetTime.getTime()) {
        this.limits.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  // Utility method to create custom rate limit configurations
  createConfig(
    maxRequests: number,
    windowMs: number,
    options?: {
      skipSuccessfulRequests?: boolean;
      skipFailedRequests?: boolean;
    }
  ): RateLimitConfig {
    return {
      maxRequests,
      windowMs,
      ...options,
    };
  }

  // Method to temporarily increase limits for specific agents (e.g., premium agents)
  async grantTemporaryIncrease(
    agentId: string,
    limitType: string,
    multiplier: number,
    durationMs: number
  ): Promise<void> {
    const originalConfig = this.configs[limitType];
    if (!originalConfig) {
      this.logger.warn(`Cannot grant increase for unknown limit type: ${limitType}`);
      return;
    }

    const increasedConfig: RateLimitConfig = {
      ...originalConfig,
      maxRequests: Math.floor(originalConfig.maxRequests * multiplier),
    };

    const tempLimitType = `${limitType}:temp:${agentId}`;
    this.configs[tempLimitType] = increasedConfig;

    // Schedule cleanup
    setTimeout(() => {
      delete this.configs[tempLimitType];
      this.logger.log(`Temporary rate limit increase expired for agent ${agentId}`);
    }, durationMs);

    this.logger.log(
      `Granted temporary rate limit increase for agent ${agentId}: ${originalConfig.maxRequests} -> ${increasedConfig.maxRequests} for ${durationMs}ms`
    );
  }
}