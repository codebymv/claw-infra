import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CodeRepo } from '../database/entities/code-repo.entity';
import { CodePr, CodePrState } from '../database/entities/code-pr.entity';
import { CodePrReview } from '../database/entities/code-pr-review.entity';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodeSyncState } from '../database/entities/code-sync-state.entity';

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
    @InjectRepository(CodeRepo) private readonly repoRepository: Repository<CodeRepo>,
    @InjectRepository(CodePr) private readonly prRepository: Repository<CodePr>,
    @InjectRepository(CodePrReview) private readonly reviewRepository: Repository<CodePrReview>,
    @InjectRepository(CodeCommit) private readonly commitRepository: Repository<CodeCommit>,
    @InjectRepository(CodeSyncState) private readonly syncStateRepository: Repository<CodeSyncState>,
    private readonly configService: ConfigService,
  ) {}

  async getOverview(filters: CodeOverviewFilters) {
    const { from, to, repo, author } = filters;

    const prsQb = this.prRepository
      .createQueryBuilder('pr')
      .leftJoin('pr.repo', 'repo')
      .where('pr.opened_at BETWEEN :from AND :to', { from, to });

    if (repo) prsQb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
    if (author) prsQb.andWhere('pr.author = :author', { author });

    const prAgg = await prsQb
      .select('COUNT(*) FILTER (WHERE pr.opened_at BETWEEN :from AND :to)', 'prsOpened')
      .addSelect('COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL AND pr.merged_at BETWEEN :from AND :to)', 'prsMerged')
      .addSelect('COALESCE(SUM(pr.additions), 0)', 'additions')
      .addSelect('COALESCE(SUM(pr.deletions), 0)', 'deletions')
      .addSelect('COALESCE(SUM(pr.changed_files), 0)', 'changedFiles')
      .addSelect('COUNT(*) FILTER (WHERE pr.first_review_at IS NOT NULL)', 'reviewedPrs')
      .addSelect(
        'COALESCE(SUM(EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at))) FILTER (WHERE pr.merged_at IS NOT NULL), 0)',
        'mergeLatencySecondsTotal',
      )
      .addSelect('COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL)', 'mergeLatencyCount')
      .addSelect(
        'COALESCE(SUM(EXTRACT(EPOCH FROM (pr.first_review_at - pr.opened_at))) FILTER (WHERE pr.first_review_at IS NOT NULL), 0)',
        'firstReviewLatencySecondsTotal',
      )
      .addSelect('COUNT(*) FILTER (WHERE pr.first_review_at IS NOT NULL)', 'firstReviewLatencyCount')
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

    if (repo) commitsQb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
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

    if (repo) qb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
    if (author) qb.andWhere('pr.author = :author', { author });

    return qb
      .select("DATE_TRUNC('day', pr.opened_at)", 'day')
      .addSelect('COUNT(*)', 'prsOpened')
      .addSelect('COUNT(*) FILTER (WHERE pr.merged_at IS NOT NULL)', 'prsMerged')
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
          wqb.where('pr.opened_at BETWEEN :from AND :to', { from, to }).orWhere(
            'pr.merged_at IS NOT NULL AND pr.merged_at BETWEEN :from AND :to',
            { from, to },
          );
        }),
      );

    if (repo) qb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });
    if (author) qb.andWhere('pr.author = :author', { author });
    if (state) qb.andWhere('pr.state = :state', { state });

    const [items, total] = await qb
      .orderBy('COALESCE(pr.merged_at, pr.opened_at)', 'DESC')
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

    if (repo) mergedQb.andWhere("CONCAT(repo.owner, '/', repo.name) = :repo", { repo });

    const mergedAgg = await mergedQb.select('COUNT(*)', 'mergedCount').getRawOne<{ mergedCount: string }>();

    const followUpWindowHours = parseInt(
      this.configService.get<string>('CODE_QUALITY_HOTFIX_WINDOW_HOURS') || '48',
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
      .andWhere(repo ? "CONCAT(repo.owner, '/', repo.name) = :repo" : '1=1', { repo })
      .select('merged.id', 'mergedId')
      .addSelect('COUNT(followup.id)', 'followups')
      .groupBy('merged.id')
      .getRawMany<{ mergedId: string; followups: string }>();

    const revertedOrHotfixed = hotfixRows.filter((row) => parseInt(row.followups || '0', 10) > 0).length;
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

    let repoEntity: CodeRepo | null = null;
    if (repo) {
      const [owner, name] = repo.split('/');
      if (owner && name) {
        repoEntity = await this.repoRepository.findOne({ where: { provider: 'github', owner, name } });
      }
    }

    const syncRow = this.syncStateRepository.create({
      provider: 'github',
      stream: repo ? 'manual-backfill-repo' : 'manual-backfill-global',
      repoId: repoEntity?.id ?? null,
      cursorValue: now.toISOString(),
      lastSyncedAt: now,
      metadata: {
        requestedAt: now.toISOString(),
        scope: repo || 'all',
        note: 'Backfill trigger recorded. Provider sync worker wiring lands in a follow-up phase.',
      },
    });

    const saved = await this.syncStateRepository.save(syncRow);

    return {
      accepted: true,
      message: 'Backfill request recorded',
      syncStateId: saved.id,
      scope: repo || 'all',
    };
  }
}
