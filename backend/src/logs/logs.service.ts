import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentLog, LogLevel } from '../database/entities/agent-log.entity';

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
  ) {}

  async ingest(dto: IngestLogDto): Promise<AgentLog> {
    const log = this.logRepo.create(dto);
    return this.logRepo.save(log);
  }

  async ingestBatch(dtos: IngestLogDto[]): Promise<AgentLog[]> {
    const logs = this.logRepo.create(dtos);
    return this.logRepo.save(logs);
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

    if (options.level) qb.andWhere('l.level = :level', { level: options.level });
    if (options.stepId) qb.andWhere('l.step_id = :stepId', { stepId: options.stepId });
    if (options.cursor) {
      qb.andWhere('l.created_at > (SELECT created_at FROM agent_logs WHERE id = :cursor)', {
        cursor: options.cursor,
      });
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
