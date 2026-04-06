import { api } from './client';
import type { GitHubStatus, GitHubInstallation, GitHubRepoGrantEntry } from './types';

class GitHubApi {
  async getStatus(): Promise<GitHubStatus> {
    return api.get('/github/status');
  }

  async getInstallations(): Promise<GitHubInstallation[]> {
    return api.get('/github/installations');
  }

  async disconnect(id: string): Promise<void> {
    return api.delete(`/github/installations/${id}`);
  }

  async getRepos(): Promise<{ full_name: string; name: string; owner: { login: string }; private: boolean; default_branch: string; html_url: string }[]> {
    return api.get('/github/repos');
  }

  async getGrantedRepos(): Promise<GitHubRepoGrantEntry[]> {
    return api.get('/github/repos/granted');
  }

  async grantRepo(installationId: string, repoFullName: string): Promise<GitHubRepoGrantEntry> {
    return api.post('/github/repos/grant', { installationId, repoFullName });
  }

  async revokeGrant(grantId: string): Promise<void> {
    return api.delete(`/github/repos/grant/${grantId}`);
  }
}

export const githubApi = new GitHubApi();