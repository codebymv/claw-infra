import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentLog, LogLevel } from '../database/entities/agent-log.entity';
import { AppGateway } from '../ws/app.gateway';

export interface IngestLogDto {
  runId: string;
  stepId?: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(AgentLog)
    private readonly logRepo: Repository<AgentLog>,
    private readonly gateway: AppGateway,
  ) {}

  async ingest(dto: IngestLogDto): Promise<AgentLog> {
    const log = this.logRepo.create(dto);
    const saved = await this.logRepo.save(log);
    this.gateway.broadcastLog(saved.runId, saved);
    return saved;
  }

  async ingestBatch(dtos: IngestLogDto[]): Promise<AgentLog[]> {
    const logs = this.logRepo.create(dtos);
    const saved = await this.logRepo.save(logs);
    saved.forEach((entry) => this.gateway.broadcastLog(entry.runId, entry));
    return saved;
  }

  async getRunLogs(
    runId: string,
    options: {
      level?: LogLevel;
      stepId?: string;
      page?: number;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 100, 500);
    const skip = (page - 1) * limit;

    const qb = this.logRepo
      .createQueryBuilder('l')
      .where('l.run_id = :runId', { runId })
      .orderBy('l.created_at', 'ASC')
      .skip(skip)
      .take(limit);

    if (options.level)
      qb.andWhere('l.level = :level', { level: options.level });
    if (options.stepId)
      qb.andWhere('l.step_id = :stepId', { stepId: options.stepId });
    if (options.cursor) {
      qb.andWhere(
        'l.created_at > (SELECT created_at FROM agent_logs WHERE id = :cursor)',
        {
          cursor: options.cursor,
        },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getRecentErrors(limit = 20) {
    return this.logRepo.find({
      where: { level: LogLevel.ERROR },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['run'],
    });
  }
}
