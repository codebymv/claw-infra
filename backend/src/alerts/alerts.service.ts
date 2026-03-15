import { Injectable, Logger } from '@nestjs/common';
import { TelegramService } from './telegram.service';

export enum AlertType {
  RUN_FAILED = 'run_failed',
  BUDGET_EXCEEDED = 'budget_exceeded',
  BLOCKED_IP = 'blocked_ip',
  AUTH_FAILURE = 'auth_failure',
  HEALTH_DEGRADED = 'health_degraded',
}

interface AlertPayload {
  type: AlertType;
  title: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly telegram: TelegramService) {}

  async fire(payload: AlertPayload): Promise<void> {
    const icon = this.iconFor(payload.type);
    const lines = [`${icon} <b>${payload.title}</b>`];

    if (payload.details) {
      lines.push(payload.details);
    }

    if (payload.metadata) {
      const meta = Object.entries(payload.metadata)
        .map(([k, v]) => `  <code>${k}</code>: ${v}`)
        .join('\n');
      lines.push(meta);
    }

    lines.push(`<i>${new Date().toISOString()}</i>`);

    const message = lines.join('\n');
    this.logger.warn(`Alert [${payload.type}]: ${payload.title}`);

    await this.telegram.send(message);
  }

  async runFailed(
    agentName: string,
    runId: string,
    error?: string,
  ): Promise<void> {
    await this.fire({
      type: AlertType.RUN_FAILED,
      title: `Agent run failed: ${agentName}`,
      details: error ? `Error: ${error}` : undefined,
      metadata: { runId },
    });
  }

  async budgetExceeded(
    agentName: string,
    spent: string,
    limit: string,
  ): Promise<void> {
    await this.fire({
      type: AlertType.BUDGET_EXCEEDED,
      title: `Budget threshold exceeded`,
      details: `${agentName || 'Global'}: $${spent} / $${limit}`,
    });
  }

  async blockedIp(ip: string, path: string): Promise<void> {
    await this.fire({
      type: AlertType.BLOCKED_IP,
      title: `Blocked IP attempt`,
      metadata: { ip, path },
    });
  }

  async authFailure(email: string, reason: string): Promise<void> {
    await this.fire({
      type: AlertType.AUTH_FAILURE,
      title: `Authentication failure`,
      metadata: { email, reason },
    });
  }

  async healthDegraded(details: string): Promise<void> {
    await this.fire({
      type: AlertType.HEALTH_DEGRADED,
      title: `System health degraded`,
      details,
    });
  }

  private iconFor(type: AlertType): string {
    const icons: Record<AlertType, string> = {
      [AlertType.RUN_FAILED]: '\u274C',
      [AlertType.BUDGET_EXCEEDED]: '\u26A0\uFE0F',
      [AlertType.BLOCKED_IP]: '\uD83D\uDEAB',
      [AlertType.AUTH_FAILURE]: '\uD83D\uDD12',
      [AlertType.HEALTH_DEGRADED]: '\uD83D\uDCA5',
    };
    return icons[type] || '\u2757';
  }
}
