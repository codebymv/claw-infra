import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CodeRepo } from '../database/entities/code-repo.entity';
import { CodePr, CodePrState } from '../database/entities/code-pr.entity';
import { CodePrReview } from '../database/entities/code-pr-review.entity';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodeSyncState } from '../database/entities/code-sync-state.entity';
import { CodeSyncService } from './code.sync.service';

export interface CodeOverviewFilters {
  from: Date;
  to: Date;
  repo?: string;
  author?: string;
}

export interface CodeTrendsFilters extends CodeOverviewFilters {
  bucket?: 'day';
}

export interface CodePrsFilters extends CodeOverviewFilters {
  state?: CodePrState;
  page: number;
  limit: number;
}

@Injectable()
export class CodeService {
  constructor(
    @InjectRepository(CodeRepo)
    private readonly repoRepository: Repository<CodeRepo>,
    @InjectRepository(CodePr) private readonly prRepository: Repository<CodePr>,
    @InjectRepository(CodePrReview)
    private readonly reviewRepository: Repository<CodePrReview>,
    @InjectRepository(CodeCommit)
    private readonly commitRepository: Repository<CodeCommit>,
    @InjectRepository(CodeSyncState)
    private readonly syncStateRepository: Repository<CodeSyncState>,
    private readonly codeSyncService: CodeSyncService,
    private readonly configService: ConfigService,
  ) {}

  async getOverview(filters: CodeOverviewFilters) {
    const { from, to, repo, author } = filters;

    const prsQb = this.prRepository
      .createQueryBuilder('pr')
      .leftJoin('pr.repo', 'repo')
      .where('pr.opened_at BETWEEN :from AND :to', { from, to });

    if (repo)
      prsQb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
    if (author) prsQb.andWhere('pr.author = :author', { author });

    const prAgg = await prsQb
      .select(
        'COUNT(*) FILTER (WHERE pr.opened_at BETWEEN :from AND :to)',
        'prsOpened',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL AND pr.merged_at BETWEEN :from AND :to)',
        'prsMerged',
      )
      .addSelect('COALESCE(SUM(pr.additions), 0)', 'additions')
      .addSelect('COALESCE(SUM(pr.deletions), 0)', 'deletions')
      .addSelect('COALESCE(SUM(pr.changed_files), 0)', 'changedFiles')
      .addSelect(
        'COUNT(*) FILTER (WHERE pr.first_review_at IS NOT NULL)',
        'reviewedPrs',
      )
      .addSelect(
        'COALESCE(SUM(EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at))) FILTER (WHERE pr.merged_at IS NOT NULL), 0)',
        'mergeLatencySecondsTotal',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL)',
        'mergeLatencyCount',
      )
      .addSelect(
        'COALESCE(SUM(EXTRACT(EPOCH FROM (pr.first_review_at - pr.opened_at))) FILTER (WHERE pr.first_review_at IS NOT NULL), 0)',
        'firstReviewLatencySecondsTotal',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE pr.first_review_at IS NOT NULL)',
        'firstReviewLatencyCount',
      )
      .getRawOne<{
        prsOpened: string;
        prsMerged: string;
        additions: string;
        deletions: string;
        changedFiles: string;
        reviewedPrs: string;
        mergeLatencySecondsTotal: string;
        mergeLatencyCount: string;
        firstReviewLatencySecondsTotal: string;
        firstReviewLatencyCount: string;
      }>();

    const commitsQb = this.commitRepository
      .createQueryBuilder('c')
      .leftJoin('c.repo', 'repo')
      .where('c.committed_at BETWEEN :from AND :to', { from, to });

    if (repo)
      commitsQb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", {
        repo,
      });
    if (author) commitsQb.andWhere('c.author = :author', { author });

    const commitAgg = await commitsQb
      .select('COUNT(*)', 'commits')
      .getRawOne<{ commits: string }>();

    const additions = parseInt(prAgg?.additions || '0', 10);
    const deletions = parseInt(prAgg?.deletions || '0', 10);

    return {
      prsOpened: parseInt(prAgg?.prsOpened || '0', 10),
      prsMerged: parseInt(prAgg?.prsMerged || '0', 10),
      commits: parseInt(commitAgg?.commits || '0', 10),
      changedFiles: parseInt(prAgg?.changedFiles || '0', 10),
      additions,
      deletions,
      netLines: additions - deletions,
      reviewedPrs: parseInt(prAgg?.reviewedPrs || '0', 10),
      averageMergeLatencySeconds:
        parseInt(prAgg?.mergeLatencyCount || '0', 10) > 0
          ? Math.round(
              parseFloat(prAgg?.mergeLatencySecondsTotal || '0') /
                parseInt(prAgg?.mergeLatencyCount || '1', 10),
            )
          : null,
      averageFirstReviewLatencySeconds:
        parseInt(prAgg?.firstReviewLatencyCount || '0', 10) > 0
          ? Math.round(
              parseFloat(prAgg?.firstReviewLatencySecondsTotal || '0') /
                parseInt(prAgg?.firstReviewLatencyCount || '1', 10),
            )
          : null,
    };
  }

  async getTrends(filters: CodeTrendsFilters) {
    const { from, to, repo, author } = filters;

    const qb = this.prRepository
      .createQueryBuilder('pr')
      .leftJoin('pr.repo', 'repo')
      .where('pr.opened_at BETWEEN :from AND :to', { from, to });

    if (repo)
      qb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
    if (author) qb.andWhere('pr.author = :author', { author });

    return qb
      .select("DATE_TRUNC('day', pr.opened_at)", 'day')
      .addSelect('COUNT(*)', 'prsOpened')
      .addSelect(
        'COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL)',
        'prsMerged',
      )
      .addSelect('COALESCE(SUM(pr.additions), 0)', 'additions')
      .addSelect('COALESCE(SUM(pr.deletions), 0)', 'deletions')
      .addSelect('COALESCE(SUM(pr.changed_files), 0)', 'changedFiles')
      .addSelect(
        'COALESCE(AVG(EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at))) FILTER (WHERE pr.merged_at IS NOT NULL), NULL)',
        'avgMergeLatencySeconds',
      )
      .addSelect(
        'COALESCE(AVG(EXTRACT(EPOCH FROM (pr.first_review_at - pr.opened_at))) FILTER (WHERE pr.first_review_at IS NOT NULL), NULL)',
        'avgFirstReviewLatencySeconds',
      )
      .groupBy("DATE_TRUNC('day', pr.opened_at)")
      .orderBy("DATE_TRUNC('day', pr.opened_at)", 'ASC')
      .getRawMany();
  }

  async listPrs(filters: CodePrsFilters) {
    const { from, to, repo, author, state, page, limit } = filters;

    const qb = this.prRepository
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.repo', 'repo')
      .leftJoinAndSelect('pr.reviews', 'reviews')
      .where(
        new Brackets((wqb) => {
          wqb
            .where('pr.opened_at BETWEEN :from AND :to', { from, to })
            .orWhere(
              'pr.merged_at IS NOT NULL AND pr.merged_at BETWEEN :from AND :to',
              { from, to },
            );
        }),
      );

    if (repo)
      qb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
    if (author) qb.andWhere('pr.author = :author', { author });
    if (state) qb.andWhere('pr.state = :state', { state });

    const [items, total] = await qb
      .addSelect('COALESCE(pr.merged_at, pr.opened_at)', 'sort_date')
      .orderBy('sort_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        repo: `${pr.repo.owner}/${pr.repo.name}`,
        author: pr.author,
        state: pr.state,
        draft: pr.draft,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
        openedAt: pr.openedAt,
        firstReviewAt: pr.firstReviewAt,
        mergedAt: pr.mergedAt,
        closedAt: pr.closedAt,
        mergedBy: pr.mergedBy,
        reviewCount: pr.reviews?.length || 0,
        cycleTimeSeconds: pr.mergedAt
          ? Math.round((pr.mergedAt.getTime() - pr.openedAt.getTime()) / 1000)
          : null,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getQuality(filters: CodeOverviewFilters) {
    const { from, to, repo } = filters;

    const mergedQb = this.prRepository
      .createQueryBuilder('pr')
      .leftJoin('pr.repo', 'repo')
      .where('pr.merged_at BETWEEN :from AND :to', { from, to });

    if (repo)
      mergedQb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });

    const mergedAgg = await mergedQb
      .select('COUNT(*)', 'mergedCount')
      .getRawOne<{ mergedCount: string }>();

    const followUpWindowHours = parseInt(
      this.configService.get<string>('CODE_QUALITY_HOTFIX_WINDOW_HOURS') ||
        '48',
      10,
    );

    const hotfixRows = await this.prRepository
      .createQueryBuilder('merged')
      .leftJoin('merged.repo', 'repo')
      .leftJoin(
        CodePr,
        'followup',
        `followup.repo_id = merged.repo_id
         AND followup.opened_at > merged.merged_at
         AND followup.opened_at <= merged.merged_at + (:windowHours || ' hours')::interval
         AND (
           LOWER(followup.title) LIKE '%hotfix%'
           OR LOWER(followup.title) LIKE '%revert%'
           OR LOWER(followup.title) LIKE 'fix:%'
         )`,
        { windowHours: String(followUpWindowHours) },
      )
      .where('merged.merged_at BETWEEN :from AND :to', { from, to })
      .andWhere(repo ? "CONCAT(repo.owner, '/', repo.name) = :repo" : '1=1', {
        repo,
      })
      .select('merged.id', 'mergedId')
      .addSelect('COUNT(followup.id)', 'followups')
      .groupBy('merged.id')
      .getRawMany<{ mergedId: string; followups: string }>();

    const revertedOrHotfixed = hotfixRows.filter(
      (row) => parseInt(row.followups || '0', 10) > 0,
    ).length;
    const merged = parseInt(mergedAgg?.mergedCount || '0', 10);

    return {
      mergedPrs: merged,
      revertOrHotfixFollowupCount: revertedOrHotfixed,
      revertOrHotfixFollowupRate: merged > 0 ? revertedOrHotfixed / merged : 0,
      hotfixWindowHours: followUpWindowHours,
    };
  }

  async triggerBackfill(repo?: string) {
    const now = new Date();
    const lookbackDays = Math.max(
      1,
      parseInt(
        this.configService.get<string>('CODE_BACKFILL_DAYS') || '30',
        10,
      ),
    );
    const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const summaries = [] as Array<{
      repo: string;
      pullRequestsFetched: number;
      reviewsFetched: number;
      commitsFetched: number;
    }>;

    if (repo) {
      const [owner, name] = repo.split('/');
      if (!owner || !name) {
        return {
          accepted: false,
          message: 'Invalid repo format. Expected owner/name',
          scope: repo,
        };
      }

      const summary = await this.codeSyncService.backfillRepo(
        owner,
        name,
        from,
        now,
      );
      summaries.push({
        repo: `${owner}/${name}`,
        pullRequestsFetched: summary.pullRequestsFetched,
        reviewsFetched: summary.reviewsFetched,
        commitsFetched: summary.commitsFetched,
      });

      await this.syncStateRepository.upsert(
        [
          {
            provider: 'github',
            stream: 'manual-backfill-repo',
            repoId: summary.repoId,
            cursorValue: now.toISOString(),
            lastSyncedAt: now,
            metadata: {
              requestedAt: now.toISOString(),
              from: from.toISOString(),
              to: now.toISOString(),
              scope: repo,
              ...summaries[0],
            },
          },
        ],
        ['provider', 'stream', 'repoId'],
      );
    } else {
      const repoMap = new Map<string, { owner: string; name: string }>();

      const existingRepos = await this.repoRepository.find({
        where: { provider: 'github', isActive: true },
      });

      for (const repoEntity of existingRepos) {
        repoMap.set(`${repoEntity.owner}/${repoEntity.name}`.toLowerCase(), {
          owner: repoEntity.owner,
          name: repoEntity.name,
        });
      }

      const configuredRepos = (
        this.configService.get<string>('CODE_GITHUB_REPOS') || ''
      )
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      for (const full of configuredRepos) {
        const [owner, name] = full.split('/');
        if (!owner || !name) continue;
        repoMap.set(`${owner}/${name}`.toLowerCase(), { owner, name });
      }

      for (const targetRepo of repoMap.values()) {
        const summary = await this.codeSyncService.backfillRepo(
          targetRepo.owner,
          targetRepo.name,
          from,
          now,
        );

        summaries.push({
          repo: `${targetRepo.owner}/${targetRepo.name}`,
          pullRequestsFetched: summary.pullRequestsFetched,
          reviewsFetched: summary.reviewsFetched,
          commitsFetched: summary.commitsFetched,
        });
      }

      await this.syncStateRepository.upsert(
        [
          {
            provider: 'github',
            stream: 'manual-backfill-global',
            repoId: null,
            cursorValue: now.toISOString(),
            lastSyncedAt: now,
            metadata: {
              requestedAt: now.toISOString(),
              from: from.toISOString(),
              to: now.toISOString(),
              scope: 'all',
              reposProcessed: summaries.length,
            },
          },
        ],
        ['provider', 'stream', 'repoId'],
      );
    }

    return {
      accepted: true,
      message: 'Backfill completed',
      scope: repo || 'all',
      from,
      to: now,
      reposProcessed: summaries.length,
      summaries,
    };
  }
}
