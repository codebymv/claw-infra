import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CodeRepo } from '../database/entities/code-repo.entity';
import { CodeSyncState } from '../database/entities/code-sync-state.entity';
import { CodeProviderGithub } from './code.provider.github';

@Injectable()
export class CodeSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CodeSyncService.name);
  private reconciliationTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(CodeRepo) private readonly repoRepository: Repository<CodeRepo>,
    @InjectRepository(CodeSyncState) private readonly syncStateRepository: Repository<CodeSyncState>,
    private readonly githubProvider: CodeProviderGithub,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<string>('CODE_WEBHOOKS_ENABLED') !== 'false';
    if (!enabled) return;

    const intervalMinutes = Math.max(
      5,
      parseInt(this.config.get<string>('CODE_RECONCILIATION_INTERVAL_MINUTES') || '360', 10),
    );

    this.reconciliationTimer = setInterval(() => {
      this.reconcileGithubRepos().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Scheduled reconciliation failed: ${message}`);
      });
    }, intervalMinutes * 60 * 1000);

    this.logger.log(`Code reconciliation scheduler started (${intervalMinutes}m interval)`);
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = null;
    }
  }

  async backfillRepo(owner: string, name: string, from: Date, to: Date) {
    const prs = await this.githubProvider.fetchPullRequests({ owner, name }, from, to);
    const commits = await this.githubProvider.fetchCommits({ owner, name }, from, to);

    return {
      owner,
      name,
      from,
      to,
      pullRequestsFetched: prs.length,
      commitsFetched: commits.length,
    };
  }

  async processGithubWebhook(event: string, deliveryId: string, body: unknown) {
    const stream = `webhook:${event}`;
    const now = new Date();

    const state = await this.syncStateRepository.findOne({
      where: {
        provider: 'github',
        stream,
        repoId: IsNull(),
      },
    });

    if (state?.cursorValue === deliveryId) {
      return {
        accepted: true,
        duplicate: true,
        event,
        deliveryId,
        message: 'Duplicate delivery ignored',
      };
    }

    const providerResult = await this.githubProvider.handleWebhookEvent({ event, deliveryId, body });

    const metadata = {
      lastDeliveryId: deliveryId,
      acceptedAt: now.toISOString(),
      previousDeliveryId: state?.cursorValue || null,
    };

    if (state) {
      state.cursorValue = deliveryId;
      state.lastSyncedAt = now;
      state.metadata = metadata;
      await this.syncStateRepository.save(state);
    } else {
      await this.syncStateRepository.save(
        this.syncStateRepository.create({
          provider: 'github',
          stream,
          repoId: null,
          cursorValue: deliveryId,
          lastSyncedAt: now,
          metadata,
        }),
      );
    }

    return {
      accepted: true,
      duplicate: false,
      event,
      deliveryId,
      providerResult,
    };
  }

  async reconcileGithubRepos() {
    const enabled = this.config.get<string>('CODE_WEBHOOKS_ENABLED') !== 'false';
    if (!enabled) {
      return {
        scheduled: false,
        reason: 'CODE_WEBHOOKS_ENABLED=false',
      };
    }

    const repos = await this.repoRepository.find({ where: { provider: 'github', isActive: true } });
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);

    const results = [] as Array<{
      repo: string;
      pullRequestsFetched: number;
      commitsFetched: number;
    }>;

    for (const repo of repos) {
      const summary = await this.backfillRepo(repo.owner, repo.name, from, to);
      results.push({
        repo: `${repo.owner}/${repo.name}`,
        pullRequestsFetched: summary.pullRequestsFetched,
        commitsFetched: summary.commitsFetched,
      });
    }

    this.logger.log(`Reconciliation pass complete for ${results.length} repos`);

    return {
      scheduled: true,
      from,
      to,
      reposProcessed: results.length,
      results,
    };
  }
}
