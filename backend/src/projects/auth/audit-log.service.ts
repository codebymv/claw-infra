import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  projectId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// For now, we'll use simple logging. In the future, this could be extended
// to store audit logs in a dedicated table or external service
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  async logAccess(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    // Log to application logs
    this.logger.log(
      `AUDIT: ${logEntry.action} on ${logEntry.resource}:${logEntry.resourceId} by user:${logEntry.userId}`,
      {
        ...logEntry,
        type: 'audit',
      },
    );

    // TODO: In the future, store in dedicated audit log table
    // await this.auditLogRepo.save(logEntry);
  }

  async logPermissionCheck(
    userId: string,
    resource: string,
    resourceId: string,
    permission: string,
    granted: boolean,
    reason?: string,
  ): Promise<void> {
    await this.logAccess({
      userId,
      action: `permission_check:${permission}`,
      resource,
      resourceId,
      metadata: {
        granted,
        reason,
      },
    });
  }

  async logProjectAccess(
    userId: string,
    projectId: string,
    action: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logAccess({
      userId,
      action,
      resource: 'project',
      resourceId: projectId,
      projectId,
      metadata,
    });
  }

  async logCardAccess(
    userId: string,
    cardId: string,
    projectId: string,
    action: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logAccess({
      userId,
      action,
      resource: 'card',
      resourceId: cardId,
      projectId,
      metadata,
    });
  }

  async logBoardAccess(
    userId: string,
    boardId: string,
    projectId: string,
    action: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logAccess({
      userId,
      action,
      resource: 'board',
      resourceId: boardId,
      projectId,
      metadata,
    });
  }

  async logCommentAccess(
    userId: string,
    commentId: string,
    projectId: string,
    action: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logAccess({
      userId,
      action,
      resource: 'comment',
      resourceId: commentId,
      projectId,
      metadata,
    });
  }

  async logApiKeyUsage(
    apiKeyId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logAccess({
      userId: `api_key:${apiKeyId}`,
      action,
      resource,
      resourceId,
      metadata: {
        ...metadata,
        authType: 'api_key',
      },
    });
  }
}
