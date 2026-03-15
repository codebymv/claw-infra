import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { PubSubService } from './pubsub.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  private migrationsComplete = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly pubSubService: PubSubService,
  ) {
    // Check migrations on startup
    this.checkMigrations();
  }

  private async checkMigrations() {
    try {
      const pendingMigrations = await this.dataSource.showMigrations();
      this.migrationsComplete = !pendingMigrations;
    } catch (error) {
      console.error('Failed to check migrations:', error);
      this.migrationsComplete = false;
    }
  }

  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'down' | 'migrating'> = {
      db: 'down',
      redis: 'down',
      migrations: this.migrationsComplete ? 'ok' : 'migrating',
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
    const status = values.every((s) => s === 'ok')
      ? 'ok'
      : values.some((s) => s === 'ok')
        ? 'degraded'
        : 'down';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    // Readiness check - only ready after migrations complete
    if (!this.migrationsComplete) {
      return {
        status: 'not_ready',
        reason: 'migrations_pending',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'not_ready',
        reason: 'database_unavailable',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('live')
  async live() {
    // Liveness check - just check if process is running
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}
