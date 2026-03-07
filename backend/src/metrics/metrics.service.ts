import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceSnapshot } from '../database/entities/resource-snapshot.entity';
import { AppGateway } from '../ws/app.gateway';

export interface IngestSnapshotDto {
  runId?: string;
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  diskIoReadMb?: number;
  diskIoWriteMb?: number;
  networkInMb?: number;
  networkOutMb?: number;
  activeConnections?: number;
  recordedAt?: string;
}

type Resolution = '1h' | '6h' | '24h' | '7d';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(ResourceSnapshot)
    private readonly snapshotRepo: Repository<ResourceSnapshot>,
    private readonly gateway: AppGateway,
  ) {}

  async ingest(dto: IngestSnapshotDto): Promise<ResourceSnapshot> {
    const snapshot = this.snapshotRepo.create({
      ...dto,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
    });
    const saved = await this.snapshotRepo.save(snapshot);
    this.gateway.broadcastResourceUpdate(saved);
    return saved;
  }

  async getLatest(): Promise<ResourceSnapshot | null> {
    return this.snapshotRepo.findOne({
      where: {},
      order: { recordedAt: 'DESC' },
    });
  }

  async getHistory(resolution: Resolution = '1h') {
    const resolutionMs: Record<Resolution, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    const from = new Date(Date.now() - resolutionMs[resolution]);

    const truncMap: Record<Resolution, string> = {
      '1h': 'minute',
      '6h': '5 minutes',
      '24h': 'hour',
      '7d': 'day',
    };
    const trunc = truncMap[resolution];

    return this.snapshotRepo
      .createQueryBuilder('s')
      .select(`DATE_TRUNC('${trunc}', s.recorded_at)`, 'time')
      .addSelect('AVG(s.cpu_percent)', 'avgCpu')
      .addSelect('AVG(s.memory_mb)', 'avgMemoryMb')
      .addSelect('AVG(s.memory_percent)', 'avgMemoryPercent')
      .addSelect('MAX(s.cpu_percent)', 'maxCpu')
      .addSelect('MAX(s.memory_mb)', 'maxMemoryMb')
      .where('s.recorded_at > :from', { from })
      .groupBy(`DATE_TRUNC('${trunc}', s.recorded_at)`)
      .orderBy(`DATE_TRUNC('${trunc}', s.recorded_at)`, 'ASC')
      .getRawMany();
  }

  async getByAgent(from: Date, to: Date) {
    return this.snapshotRepo
      .createQueryBuilder('s')
      .leftJoin('s.run', 'run')
      .select('run.agent_name', 'agentName')
      .addSelect('AVG(s.cpu_percent)', 'avgCpu')
      .addSelect('AVG(s.memory_mb)', 'avgMemoryMb')
      .addSelect('MAX(s.cpu_percent)', 'peakCpu')
      .addSelect('MAX(s.memory_mb)', 'peakMemoryMb')
      .where('s.recorded_at BETWEEN :from AND :to', { from, to })
      .andWhere('s.run_id IS NOT NULL')
      .groupBy('run.agent_name')
      .orderBy('AVG(s.cpu_percent)', 'DESC')
      .getRawMany();
  }

  async getRunMetrics(runId: string) {
    return this.snapshotRepo.find({
      where: { runId },
      order: { recordedAt: 'ASC' },
    });
  }
}
