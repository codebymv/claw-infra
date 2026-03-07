import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository, LessThan } from 'typeorm';
import { IdempotencyRecord } from '../database/entities/idempotency-record.entity';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly idempotencyRepo: Repository<IdempotencyRecord>,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('INGEST_IDEMPOTENCY_ENABLED') === 'true';
  }

  ttlHours(): number {
    const parsed = parseInt(this.config.get<string>('INGEST_IDEMPOTENCY_TTL_HOURS') || '24', 10);
    if (Number.isNaN(parsed) || parsed < 1) return 24;
    return parsed;
  }

  buildKeyHash(rawKey: string, route: string, tokenPrefix: string | null): string {
    const normalized = [rawKey.trim(), route.trim().toLowerCase(), tokenPrefix || ''].join('|');
    return createHash('sha256').update(normalized).digest('hex');
  }

  async findByHash(keyHash: string): Promise<IdempotencyRecord | null> {
    const record = await this.idempotencyRepo.findOne({ where: { keyHash } });
    if (!record) return null;

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.idempotencyRepo.delete(record.id);
      return null;
    }

    return record;
  }

  async persistResponse(input: {
    keyHash: string;
    route: string;
    tokenPrefix: string | null;
    statusCode: number;
    responseBody: unknown;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + this.ttlHours() * 60 * 60 * 1000);

    const existing = await this.idempotencyRepo.findOne({ where: { keyHash: input.keyHash } });
    if (existing) {
      this.logger.debug(`Idempotency collision on ${input.route}, preserving original response`);
      return;
    }

    const record = this.idempotencyRepo.create({
      keyHash: input.keyHash,
      route: input.route,
      tokenPrefix: input.tokenPrefix,
      statusCode: input.statusCode,
      responseBody: input.responseBody,
      expiresAt,
    });

    await this.idempotencyRepo.save(record);
  }

  async pruneExpired(limit = 1000): Promise<number> {
    const expired = await this.idempotencyRepo.find({
      where: { expiresAt: LessThan(new Date()) },
      select: ['id'],
      take: limit,
    });

    if (expired.length === 0) return 0;
    const result = await this.idempotencyRepo.delete(expired.map((r) => r.id));
    return result.affected || 0;
  }
}
