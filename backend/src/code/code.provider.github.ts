import { Injectable } from '@nestjs/common';

export interface GithubRepoRef {
  owner: string;
  name: string;
}

@Injectable()
export class CodeProviderGithub {
  async fetchPullRequests(_repo: GithubRepoRef, _from: Date, _to: Date) {
    return [];
  }

  async fetchPullRequestReviews(_repo: GithubRepoRef, _prNumber: number) {
    return [];
  }

  async fetchCommits(_repo: GithubRepoRef, _from: Date, _to: Date) {
    return [];
  }
}
