import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AlertsService } from '../../alerts/alerts.service';

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(IpAllowlistGuard.name);
  private readonly enabled: boolean;
  private readonly allowedIps: Set<string>;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(AlertsService) private readonly alerts?: AlertsService,
  ) {
    this.enabled = config.get<string>('IP_ALLOWLIST_ENABLED') === 'true';
    const raw = config.get<string>('ALLOWED_IPS') || '';
    this.allowedIps = new Set(
      raw
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean),
    );

    if (this.enabled) {
      this.logger.log(
        `IP allowlist active with ${this.allowedIps.size} entries`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request) return true;

    const path = request.url?.split('?')[0] ?? '';

    // Health checks must always pass (Railway, agent reporter, uptime monitors).
    if (path === '/api/health') return true;

    // GitHub webhooks verify their own HMAC signatures; IP check is unnecessary.
    if (path === '/api/code/webhooks/github') return true;

    // Ingest endpoints use agent API key auth; allow agent traffic from any IP.
    if (path.startsWith('/api/ingest/') && request.headers['x-agent-token']) {
      return true;
    }

    // Agent endpoints and agent-authenticated requests; allow agent traffic from any IP.
    if (request.headers['x-agent-token']) {
      // Allow agent API key authenticated requests to any endpoint
      return true;
    }

    // Authenticated browser sessions use JWT Bearer tokens; allow from any IP.
    // The downstream JwtAuthGuard will validate the token itself.
    if (request.headers.authorization?.startsWith('Bearer ')) {
      return true;
    }

    // Auth endpoints must be reachable so users can log in from any IP.
    if (path.startsWith('/api/auth/')) return true;

    const clientIp = this.extractIp(request);

    if (this.isRailwayInternal(clientIp)) return true;
    if (this.allowedIps.has(clientIp)) return true;

    this.logger.warn(
      `Blocked request from ${clientIp} to ${request.method} ${request.url}`,
    );
    this.alerts?.blockedIp(clientIp, `${request.method} ${request.url}`);

    throw new ForbiddenException('Access denied');
  }

  private extractIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        .split(',')[0]
        .trim();
      return this.normalizeIp(first);
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return this.normalizeIp(Array.isArray(realIp) ? realIp[0] : realIp);
    }

    return this.normalizeIp(request.ip || '');
  }

  private normalizeIp(ip: string): string {
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
  }

  private isRailwayInternal(ip: string): boolean {
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('fd12:')) return true;
    if (ip === '127.0.0.1' || ip === '::1') return true;
    return false;
  }
}
