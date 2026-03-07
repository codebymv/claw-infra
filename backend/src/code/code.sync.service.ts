import { Injectable } from '@nestjs/common';
import { CodeProviderGithub } from './code.provider.github';

@Injectable()
export class CodeSyncService {
  constructor(private readonly githubProvider: CodeProviderGithub) {}

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
}
