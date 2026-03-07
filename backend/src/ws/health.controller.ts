import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { PubSubService } from './pubsub.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pubSubService: PubSubService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'down'> = {
      db: 'down',
      redis: 'down',
    };

    try {
      await this.dataSource.query('SELECT 1');
      checks.db = 'ok';
    } catch {
      checks.db = 'down';
    }

    try {
      await this.pubSubService.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'down';
    }

    const values = Object.values(checks);
    const status = values.every((s) => s === 'ok') ? 'ok' : values.some((s) => s === 'ok') ? 'degraded' : 'down';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
