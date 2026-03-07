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
import { CodePr, CodePrState } from '../database/entities/code-pr.entity';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodePrReview } from '../database/entities/code-pr-review.entity';

@Injectable()
export class CodeSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CodeSyncService.name);
  private reconciliationTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(CodeRepo) private readonly repoRepository: Repository<CodeRepo>,
    @InjectRepository(CodeSyncState) private readonly syncStateRepository: Repository<CodeSyncState>,
    @InjectRepository(CodePr) private readonly prRepository: Repository<CodePr>,
    @InjectRepository(CodePrReview) private readonly reviewRepository: Repository<CodePrReview>,
    @InjectRepository(CodeCommit) private readonly commitRepository: Repository<CodeCommit>,
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

  private async listTargetRepos(): Promise<Array<{ owner: string; name: string }>> {
    const repos = await this.repoRepository.find({ where: { provider: 'github', isActive: true } });

    const byKey = new Map<string, { owner: string; name: string }>();

    for (const repo of repos) {
      byKey.set(`${repo.owner}/${repo.name}`.toLowerCase(), { owner: repo.owner, name: repo.name });
    }

    const configured = (this.config.get<string>('CODE_GITHUB_REPOS') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    for (const full of configured) {
      const [owner, name] = full.split('/');
      if (!owner || !name) continue;
      byKey.set(`${owner}/${name}`.toLowerCase(), { owner, name });
    }

    return Array.from(byKey.values());
  }

  private resolvePrState(pr: {
    state: 'open' | 'closed';
    mergedAt: Date | null;
  }): CodePrState {
    if (pr.mergedAt) return CodePrState.MERGED;
    return pr.state === 'closed' ? CodePrState.CLOSED : CodePrState.OPEN;
  }

  private async ensureRepo(owner: string, name: string): Promise<CodeRepo> {
    const existing = await this.repoRepository.findOne({
      where: { provider: 'github', owner, name },
    });

    if (existing) return existing;

    const created = this.repoRepository.create({
      provider: 'github',
      owner,
      name,
      isActive: true,
    });

    return this.repoRepository.save(created);
  }

  private async ingestRepoWindow(owner: string, name: string, from: Date, to: Date) {
    const repo = await this.ensureRepo(owner, name);

    const prs = await this.githubProvider.fetchPullRequests({ owner, name }, from, to);

    if (prs.length > 0) {
      await this.prRepository.upsert(
        prs.map((pr) => ({
          repoId: repo.id,
          externalId: pr.externalId,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          state: this.resolvePrState(pr),
          draft: pr.draft,
          labels: pr.labels,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changedFiles,
          openedAt: pr.openedAt,
          mergedAt: pr.mergedAt,
          closedAt: pr.closedAt,
          mergedBy: pr.mergedBy,
          createdAtProvider: pr.createdAtProvider,
          updatedAtProvider: pr.updatedAtProvider,
        })),
        ['repoId', 'number'],
      );
    }

    const persistedPrs = await this.prRepository.find({
      where: { repoId: repo.id },
    });
    const prByNumber = new Map<number, CodePr>(persistedPrs.map((p) => [p.number, p]));

    let reviewsFetched = 0;
    for (const pr of prs) {
      const persisted = prByNumber.get(pr.number);
      if (!persisted) continue;

      const reviews = await this.githubProvider.fetchPullRequestReviews({ owner, name }, pr.number);
      reviewsFetched += reviews.length;

      if (reviews.length > 0) {
        await this.reviewRepository.upsert(
          reviews.map((review) => ({
            prId: persisted.id,
            externalId: review.externalId,
            reviewer: review.reviewer,
            state: review.state,
            submittedAt: review.submittedAt,
          })),
          ['externalId'],
        );

        const sorted = [...reviews].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
        const firstReviewAt = sorted[0]?.submittedAt || null;

        if (
          (firstReviewAt && !persisted.firstReviewAt) ||
          (firstReviewAt && persisted.firstReviewAt && firstReviewAt.getTime() !== persisted.firstReviewAt.getTime())
        ) {
          await this.prRepository.update(persisted.id, { firstReviewAt });
        }
      }
    }

    const commits = await this.githubProvider.fetchCommits({ owner, name }, from, to);

    if (commits.length > 0) {
      await this.commitRepository.upsert(
        commits.map((commit) => ({
          repoId: repo.id,
          prId: null,
          sha: commit.sha,
          author: commit.author,
          committedAt: commit.committedAt,
          additions: commit.additions,
          deletions: commit.deletions,
          filesChanged: commit.filesChanged,
        })),
        ['sha'],
      );
    }

    await this.syncStateRepository.upsert(
      [
        {
          provider: 'github',
          stream: 'repo-reconcile',
          repoId: repo.id,
          cursorValue: to.toISOString(),
          lastSyncedAt: new Date(),
          metadata: {
            from: from.toISOString(),
            to: to.toISOString(),
            prsFetched: prs.length,
            reviewsFetched,
            commitsFetched: commits.length,
          },
        },
      ],
      ['provider', 'stream', 'repoId'],
    );

    return {
      owner,
      name,
      repoId: repo.id,
      from,
      to,
      pullRequestsFetched: prs.length,
      reviewsFetched,
      commitsFetched: commits.length,
    };
  }

  async backfillRepo(owner: string, name: string, from: Date, to: Date) {
    return this.ingestRepoWindow(owner, name, from, to);
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

    const lookbackHours = Math.max(
      1,
      parseInt(this.config.get<string>('CODE_WEBHOOK_RECONCILE_LOOKBACK_HOURS') || '168', 10),
    );

    const to = new Date();
    const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1000);

    const ingested = [] as Array<{
      repo: string;
      pullRequestsFetched: number;
      reviewsFetched: number;
      commitsFetched: number;
    }>;

    for (const repo of providerResult.repos) {
      try {
        const summary = await this.ingestRepoWindow(repo.owner, repo.name, from, to);
        ingested.push({
          repo: `${repo.owner}/${repo.name}`,
          pullRequestsFetched: summary.pullRequestsFetched,
          reviewsFetched: summary.reviewsFetched,
          commitsFetched: summary.commitsFetched,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Webhook reconcile failed for ${repo.owner}/${repo.name}: ${message}`);
      }
    }

    const metadata = {
      lastDeliveryId: deliveryId,
      acceptedAt: now.toISOString(),
      previousDeliveryId: state?.cursorValue || null,
      repos: providerResult.repos.map((r) => `${r.owner}/${r.name}`),
      ingested,
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
      ingested,
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

    const repos = await this.listTargetRepos();
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);

    const results = [] as Array<{
      repo: string;
      pullRequestsFetched: number;
      reviewsFetched: number;
      commitsFetched: number;
    }>;

    for (const repo of repos) {
      const summary = await this.backfillRepo(repo.owner, repo.name, from, to);
      results.push({
        repo: `${repo.owner}/${repo.name}`,
        pullRequestsFetched: summary.pullRequestsFetched,
        reviewsFetched: summary.reviewsFetched,
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
