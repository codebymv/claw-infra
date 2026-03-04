import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type PubSubChannel =
  | 'global:status'
  | `run:${string}`
  | `logs:${string}`
  | 'resources:live';

@Injectable()
export class PubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubService.name);
  private pub: Redis;
  private sub: Redis;
  private handlers: Map<string, ((data: unknown) => void)[]> = new Map();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.pub = new Redis(url);
    this.sub = new Redis(url);

    this.sub.on('message', (channel: string, message: string) => {
      const handlers = this.handlers.get(channel) || [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(message);
      } catch {
        parsed = message;
      }
      handlers.forEach((h) => h(parsed));
    });

    // Activate any channels registered before this init ran (e.g. from afterInit hooks)
    for (const channel of this.handlers.keys()) {
      this.sub.subscribe(channel).catch((err: Error) => this.logger.error(err.message));
    }

    this.logger.log('PubSub connected');
  }

  onModuleDestroy() {
    this.pub.disconnect();
    this.sub.disconnect();
  }

  async publish(channel: PubSubChannel, data: unknown) {
    await this.pub.publish(channel, JSON.stringify(data));
  }

  subscribe(channel: string, handler: (data: unknown) => void) {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
      // If sub is already initialized, subscribe immediately; otherwise onModuleInit will pick it up
      if (this.sub) {
        this.sub.subscribe(channel).catch((err: Error) => this.logger.error(err.message));
      }
    }
    this.handlers.get(channel)!.push(handler);
  }

  unsubscribe(channel: string, handler: (data: unknown) => void) {
    const handlers = this.handlers.get(channel) || [];
    const updated = handlers.filter((h) => h !== handler);
    if (updated.length === 0) {
      this.handlers.delete(channel);
      this.sub.unsubscribe(channel).catch((err: Error) => this.logger.error(err.message));
    } else {
      this.handlers.set(channel, updated);
    }
  }
}
