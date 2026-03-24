import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GithubInstallation } from '../database/entities/github-installation.entity';
import { GithubRepoGrant } from '../database/entities/github-repo-grant.entity';

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

export interface GithubRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
}

@Injectable()
export class GithubAppService {
  private readonly logger = new Logger(GithubAppService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(GithubInstallation)
    private readonly installationRepo: Repository<GithubInstallation>,
    @InjectRepository(GithubRepoGrant)
    private readonly repoGrantRepo: Repository<GithubRepoGrant>,
  ) {}

  getAppId(): string | undefined {
    return this.config.get<string>('GITHUB_APP_ID');
  }

  private getPrivateKey(): string | undefined {
    const key = this.config.get<string>('GITHUB_APP_PRIVATE_KEY');
    // Support both raw PEM and base64-encoded
    if (key && !key.startsWith('-----')) {
      return Buffer.from(key, 'base64').toString('utf-8');
    }
    return key;
  }

  isConfigured(): boolean {
    return Boolean(this.getAppId() && this.getPrivateKey());
  }

  getInstallUrl(): string | null {
    const appId = this.getAppId();
    const slug = this.config.get<string>('GITHUB_APP_SLUG');
    if (!slug) return appId ? `https://github.com/apps/${appId}` : null;
    return `https://github.com/apps/${slug}/installations/new`;
  }

  /** Generate a JWT to authenticate as the GitHub App itself */
  private async generateAppJwt(): Promise<string> {
    const appId = this.getAppId();
    const privateKey = this.getPrivateKey();
    if (!appId || !privateKey) {
      throw new BadRequestException('GitHub App not configured');
    }

    // Use jsonwebtoken-style manual JWT construction for RS256
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }),
    ).toString('base64url');

    const { createSign } = await import('crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign
      .sign(privateKey, 'base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${header}.${payload}.${signature}`;
  }

  /** Get or refresh an installation access token */
  async getInstallationToken(
    installation: GithubInstallation,
  ): Promise<string> {
    // Return cached token if still valid (5 min buffer)
    if (
      installation.accessToken &&
      installation.tokenExpiresAt &&
      installation.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000
    ) {
      return installation.accessToken;
    }

    const jwt = await this.generateAppJwt();
    const res = await fetch(
      `https://api.github.com/app/installations/${installation.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(
        `Failed to get installation token for ${installation.installationId}: ${res.status} ${text}`,
      );
      throw new BadRequestException('Failed to refresh GitHub installation token');
    }

    const data = (await res.json()) as InstallationTokenResponse;
    installation.accessToken = data.token;
    installation.tokenExpiresAt = new Date(data.expires_at);
    await this.installationRepo.save(installation);

    return data.token;
  }

  /** Get a valid token for GitHub API calls — installation token first, then env var fallback */
  async getToken(): Promise<string | null> {
    const installation = await this.installationRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (installation) {
      try {
        return await this.getInstallationToken(installation);
      } catch (err) {
        this.logger.warn(
          `Installation token refresh failed, falling back to env var: ${(err as Error).message}`,
        );
      }
    }

    return process.env.GITHUB_TOKEN || null;
  }

  /** Handle the callback after a user installs the GitHub App */
  async handleInstallationCallback(
    installationId: number,
  ): Promise<GithubInstallation> {
    // Fetch installation details from GitHub
    const jwt = await this.generateAppJwt();
    const res = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!res.ok) {
      throw new BadRequestException(
        `Failed to fetch installation ${installationId}`,
      );
    }

    const data = (await res.json()) as {
      id: number;
      account: { login: string; type: string };
    };

    // Upsert installation
    let installation = await this.installationRepo.findOne({
      where: { installationId },
    });

    if (installation) {
      installation.accountLogin = data.account.login;
      installation.accountType = data.account.type;
      installation.isActive = true;
    } else {
      installation = this.installationRepo.create({
        installationId,
        accountLogin: data.account.login,
        accountType: data.account.type,
      });
    }

    return this.installationRepo.save(installation);
  }

  /** List all active installations */
  async listInstallations(): Promise<GithubInstallation[]> {
    return this.installationRepo.find({
      where: { isActive: true },
      relations: ['repoGrants'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Disconnect (deactivate) an installation */
  async disconnectInstallation(id: string): Promise<void> {
    const installation = await this.installationRepo.findOne({
      where: { id },
    });
    if (!installation) {
      throw new NotFoundException('Installation not found');
    }
    installation.isActive = false;
    installation.accessToken = null;
    installation.tokenExpiresAt = null;
    await this.installationRepo.save(installation);
  }

  /** List repos accessible via the active installation */
  async listAccessibleRepos(): Promise<GithubRepo[]> {
    const token = await this.getToken();
    if (!token) return [];

    const repos: GithubRepo[] = [];
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      if (!res.ok) {
        // Fallback: try user repos endpoint (for PAT)
        if (page === 1) {
          return this.listUserRepos(token);
        }
        break;
      }

      const data = (await res.json()) as { repositories: GithubRepo[] };
      repos.push(...data.repositories);
      if (data.repositories.length < 100) break;
    }

    return repos;
  }

  private async listUserRepos(token: string): Promise<GithubRepo[]> {
    const repos: GithubRepo[] = [];
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (!res.ok) break;
      const data = (await res.json()) as GithubRepo[];
      repos.push(...data);
      if (data.length < 100) break;
    }
    return repos;
  }

  /** Get all granted repos */
  async listGrantedRepos(): Promise<GithubRepoGrant[]> {
    return this.repoGrantRepo.find({
      where: { isActive: true },
      relations: ['installation'],
      order: { repoFullName: 'ASC' },
    });
  }

  /** Enable a repo for tracking */
  async grantRepo(
    installationId: string,
    repoFullName: string,
  ): Promise<GithubRepoGrant> {
    let grant = await this.repoGrantRepo.findOne({
      where: { installationId, repoFullName },
    });

    if (grant) {
      grant.isActive = true;
    } else {
      grant = this.repoGrantRepo.create({
        installationId,
        repoFullName,
        isActive: true,
      });
    }

    return this.repoGrantRepo.save(grant);
  }

  /** Disable a repo from tracking */
  async revokeRepoGrant(grantId: string): Promise<void> {
    const grant = await this.repoGrantRepo.findOne({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Grant not found');

    grant.isActive = false;
    await this.repoGrantRepo.save(grant);
  }
}
