import { Injectable } from '@nestjs/common';

export interface GithubRepoRef {
  owner: string;
  name: string;
}

export interface GithubWebhookHandleInput {
  event: string;
  deliveryId: string;
  body: unknown;
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

  async handleWebhookEvent(input: GithubWebhookHandleInput) {
    return {
      handled: true,
      event: input.event,
      deliveryId: input.deliveryId,
      note: 'Webhook accepted. Provider ingestion mapping is implemented in a follow-up phase.',
    };
  }
}
