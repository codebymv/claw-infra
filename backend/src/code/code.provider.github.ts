import { Injectable, Logger } from '@nestjs/common';
import { CodePrReviewState } from '../database/entities/code-pr-review.entity';

export interface GithubRepoRef {
  owner: string;
  name: string;
}

export interface GithubWebhookHandleInput {
  event: string;
  deliveryId: string;
  body: unknown;
}

export interface GithubPullRequestRecord {
  externalId: string;
  number: number;
  title: string;
  author: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  openedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  mergedBy: string | null;
  createdAtProvider: Date | null;
  updatedAtProvider: Date | null;
}

export interface GithubPullRequestReviewRecord {
  externalId: string;
  reviewer: string | null;
  state: CodePrReviewState;
  submittedAt: Date;
}

export interface GithubCommitRecord {
  sha: string;
  author: string | null;
  committedAt: Date;
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface GithubWebhookHandleResult {
  handled: boolean;
  event: string;
  deliveryId: string;
  repos: GithubRepoRef[];
  note?: string;
}

interface GithubListResponseItem {
  [key: string]: unknown;
}

@Injectable()
export class CodeProviderGithub {
  private readonly logger = new Logger(CodeProviderGithub.name);

  private getToken(): string | null {
    return process.env.GITHUB_TOKEN || null;
  }

  private buildHeaders() {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'claw-infra-code-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  private async requestJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`GitHub API request failed (${response.status}) ${url}: ${text}`);
      throw new Error(`GitHub API request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }

  private normalizeReviewState(input: unknown): CodePrReviewState {
    const stateRaw = typeof input === 'string' ? input.toUpperCase() : 'COMMENTED';

    if (stateRaw === CodePrReviewState.APPROVED) return CodePrReviewState.APPROVED;
    if (stateRaw === CodePrReviewState.CHANGES_REQUESTED) return CodePrReviewState.CHANGES_REQUESTED;
    if (stateRaw === CodePrReviewState.COMMENTED) return CodePrReviewState.COMMENTED;
    if (stateRaw === CodePrReviewState.DISMISSED) return CodePrReviewState.DISMISSED;
    if (stateRaw === CodePrReviewState.PENDING) return CodePrReviewState.PENDING;

    return CodePrReviewState.COMMENTED;
  }

  async fetchPullRequests(repo: GithubRepoRef, from: Date, to: Date): Promise<GithubPullRequestRecord[]> {
    const items: GithubPullRequestRecord[] = [];

    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.name}/pulls`);
      url.searchParams.set('state', 'all');
      url.searchParams.set('sort', 'updated');
      url.searchParams.set('direction', 'desc');
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      const pageItems = await this.requestJson<GithubListResponseItem[]>(url.toString());
      if (pageItems.length === 0) break;

      for (const row of pageItems) {
        const createdAtRaw = typeof row.created_at === 'string' ? row.created_at : null;
        const updatedAtRaw = typeof row.updated_at === 'string' ? row.updated_at : null;
        const mergedAtRaw = typeof row.merged_at === 'string' ? row.merged_at : null;
        const closedAtRaw = typeof row.closed_at === 'string' ? row.closed_at : null;

        const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
        const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : null;
        const mergedAt = mergedAtRaw ? new Date(mergedAtRaw) : null;
        const closedAt = closedAtRaw ? new Date(closedAtRaw) : null;

        const relevant =
          (createdAt && createdAt >= from && createdAt <= to) ||
          (updatedAt && updatedAt >= from && updatedAt <= to) ||
          (mergedAt && mergedAt >= from && mergedAt <= to) ||
          (closedAt && closedAt >= from && closedAt <= to);

        if (!relevant) {
          continue;
        }

        const labels = Array.isArray(row.labels)
          ? row.labels
            .map((l) => {
              if (!l || typeof l !== 'object') return null;
              const name = (l as { name?: unknown }).name;
              return typeof name === 'string' ? name : null;
            })
            .filter((l): l is string => !!l)
          : [];

        const authorLogin =
          row.user && typeof row.user === 'object' && typeof (row.user as { login?: unknown }).login === 'string'
            ? ((row.user as { login: string }).login ?? null)
            : null;

        const mergedByLogin =
          row.merged_by &&
            typeof row.merged_by === 'object' &&
            typeof (row.merged_by as { login?: unknown }).login === 'string'
            ? ((row.merged_by as { login: string }).login ?? null)
            : null;

        const prNumber = typeof row.number === 'number' ? row.number : 0;
        let additions = typeof row.additions === 'number' ? row.additions : 0;
        let deletions = typeof row.deletions === 'number' ? row.deletions : 0;
        let changedFiles = typeof row.changed_files === 'number' ? row.changed_files : 0;

        if (prNumber > 0) {
          try {
            const detailUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls/${prNumber}`;
            const detail = await this.requestJson<GithubListResponseItem>(detailUrl);
            additions = typeof detail.additions === 'number' ? detail.additions : additions;
            deletions = typeof detail.deletions === 'number' ? detail.deletions : deletions;
            changedFiles = typeof detail.changed_files === 'number' ? detail.changed_files : changedFiles;
          } catch (err) {
            this.logger.warn(`Failed to fetch details for PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        items.push({
          externalId: String(row.id ?? `${repo.owner}/${repo.name}#${String(row.number ?? '')}`),
          number: prNumber,
          title: typeof row.title === 'string' ? row.title : '(untitled)',
          author: authorLogin,
          state: row.state === 'closed' ? 'closed' : 'open',
          draft: Boolean(row.draft),
          labels,
          additions,
          deletions,
          changedFiles,
          openedAt: createdAt || new Date(),
          mergedAt,
          closedAt,
          mergedBy: mergedByLogin,
          createdAtProvider: createdAt,
          updatedAtProvider: updatedAt,
        });
      }

      const oldestUpdatedAtRaw = pageItems
        .map((row) => (typeof row.updated_at === 'string' ? row.updated_at : null))
        .filter((v): v is string => !!v)
        .sort()[0];

      if (oldestUpdatedAtRaw && new Date(oldestUpdatedAtRaw) < from) {
        break;
      }
    }

    return items;
  }

  async fetchPullRequestReviews(repo: GithubRepoRef, prNumber: number): Promise<GithubPullRequestReviewRecord[]> {
    const items: GithubPullRequestReviewRecord[] = [];

    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.name}/pulls/${prNumber}/reviews`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      const pageItems = await this.requestJson<GithubListResponseItem[]>(url.toString());
      if (pageItems.length === 0) break;

      for (const row of pageItems) {
        const submittedAtRaw = typeof row.submitted_at === 'string' ? row.submitted_at : null;
        if (!submittedAtRaw) continue;

        const reviewerLogin =
          row.user && typeof row.user === 'object' && typeof (row.user as { login?: unknown }).login === 'string'
            ? ((row.user as { login: string }).login ?? null)
            : null;

        const state = this.normalizeReviewState(row.state);

        items.push({
          externalId: String(row.id ?? `${repo.owner}/${repo.name}#${prNumber}:${items.length}`),
          reviewer: reviewerLogin,
          state,
          submittedAt: new Date(submittedAtRaw),
        });
      }
    }

    return items;
  }

  async fetchCommits(repo: GithubRepoRef, from: Date, to: Date): Promise<GithubCommitRecord[]> {
    const commits: GithubCommitRecord[] = [];

    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits`);
      url.searchParams.set('since', from.toISOString());
      url.searchParams.set('until', to.toISOString());
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      const pageItems = await this.requestJson<GithubListResponseItem[]>(url.toString());
      if (pageItems.length === 0) break;

      for (const row of pageItems) {
        const sha = typeof row.sha === 'string' ? row.sha : null;
        if (!sha) continue;

        const detail = await this.requestJson<GithubListResponseItem>(
          `https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${sha}`,
        );

        const committedAtRaw =
          detail.commit &&
            typeof detail.commit === 'object' &&
            (detail.commit as { author?: unknown }).author &&
            typeof (detail.commit as { author?: { date?: unknown } }).author?.date === 'string'
            ? ((detail.commit as { author: { date: string } }).author.date ?? null)
            : null;

        if (!committedAtRaw) continue;

        const loginAuthor =
          detail.author &&
            typeof detail.author === 'object' &&
            typeof (detail.author as { login?: unknown }).login === 'string'
            ? ((detail.author as { login: string }).login ?? null)
            : null;

        const commitAuthor =
          detail.commit &&
            typeof detail.commit === 'object' &&
            (detail.commit as { author?: unknown }).author &&
            typeof (detail.commit as { author?: { name?: unknown } }).author?.name === 'string'
            ? ((detail.commit as { author: { name: string } }).author.name ?? null)
            : null;

        commits.push({
          sha,
          author: loginAuthor || commitAuthor,
          committedAt: new Date(committedAtRaw),
          additions:
            detail.stats &&
              typeof detail.stats === 'object' &&
              typeof (detail.stats as { additions?: unknown }).additions === 'number'
              ? ((detail.stats as { additions: number }).additions ?? 0)
              : 0,
          deletions:
            detail.stats &&
              typeof detail.stats === 'object' &&
              typeof (detail.stats as { deletions?: unknown }).deletions === 'number'
              ? ((detail.stats as { deletions: number }).deletions ?? 0)
              : 0,
          filesChanged: Array.isArray(detail.files) ? detail.files.length : 0,
        });
      }
    }

    return commits;
  }

  async handleWebhookEvent(input: GithubWebhookHandleInput): Promise<GithubWebhookHandleResult> {
    const repos: GithubRepoRef[] = [];

    if (input.body && typeof input.body === 'object') {
      const payload = input.body as {
        repository?: { full_name?: unknown; owner?: { login?: unknown }; name?: unknown };
      };

      const fullName =
        payload.repository && typeof payload.repository.full_name === 'string'
          ? payload.repository.full_name
          : null;

      if (fullName && fullName.includes('/')) {
        const [owner, name] = fullName.split('/');
        if (owner && name) repos.push({ owner, name });
      } else {
        const owner =
          payload.repository &&
            payload.repository.owner &&
            typeof payload.repository.owner === 'object' &&
            typeof payload.repository.owner.login === 'string'
            ? payload.repository.owner.login
            : null;
        const name = payload.repository && typeof payload.repository.name === 'string' ? payload.repository.name : null;

        if (owner && name) repos.push({ owner, name });
      }
    }

    return {
      handled: true,
      event: input.event,
      deliveryId: input.deliveryId,
      repos,
      note: repos.length > 0 ? undefined : 'Webhook accepted but no repository context was found',
    };
  }
}
