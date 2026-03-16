import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface PresenceStatus {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  currentActivity?: string;
}

export interface TypingIndicator {
  userId: string;
  sessionId: string;
  startedAt: Date;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly presenceMap = new Map<string, PresenceStatus>();
  private readonly typingMap = new Map<string, TypingIndicator>();
  private readonly AWAY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly OFFLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  private readonly TYPING_TIMEOUT_MS = 5000; // 5 seconds

  /**
   * Update user presence
   */
  updatePresence(userId: string, activity?: string): PresenceStatus {
    const existing = this.presenceMap.get(userId);
    const status: PresenceStatus = {
      userId,
      status: 'online',
      lastSeen: new Date(),
      currentActivity: activity,
    };

    this.presenceMap.set(userId, status);
    this.logger.debug(`Updated presence for user ${userId}: online`);
    
    return status;
  }

  /**
   * Mark user as offline
   */
  setOffline(userId: string): PresenceStatus {
    const status: PresenceStatus = {
      userId,
      status: 'offline',
      lastSeen: new Date(),
    };

    this.presenceMap.set(userId, status);
    this.logger.debug(`User ${userId} is now offline`);
    
    return status;
  }

  /**
   * Get user presence status
   */
  getPresence(userId: string): PresenceStatus | null {
    return this.presenceMap.get(userId) || null;
  }

  /**
   * Get multiple users' presence
   */
  getMultiplePresence(userIds: string[]): Map<string, PresenceStatus> {
    const result = new Map<string, PresenceStatus>();
    
    for (const userId of userIds) {
      const presence = this.presenceMap.get(userId);
      if (presence) {
        result.set(userId, presence);
      }
    }
    
    return result;
  }

  /**
   * Start typing indicator
   */
  startTyping(userId: string, sessionId: string): TypingIndicator {
    const indicator: TypingIndicator = {
      userId,
      sessionId,
      startedAt: new Date(),
    };

    this.typingMap.set(userId, indicator);
    this.logger.debug(`User ${userId} started typing in session ${sessionId}`);
    
    return indicator;
  }

  /**
   * Stop typing indicator
   */
  stopTyping(userId: string): void {
    this.typingMap.delete(userId);
    this.logger.debug(`User ${userId} stopped typing`);
  }

  /**
   * Get typing users in a session
   */
  getTypingUsers(sessionId: string): string[] {
    const typingUsers: string[] = [];
    
    for (const [userId, indicator] of this.typingMap.entries()) {
      if (indicator.sessionId === sessionId) {
        const elapsed = Date.now() - indicator.startedAt.getTime();
        if (elapsed < this.TYPING_TIMEOUT_MS) {
          typingUsers.push(userId);
        } else {
          this.typingMap.delete(userId);
        }
      }
    }
    
    return typingUsers;
  }

  /**
   * Get all online users
   */
  getOnlineUsers(): string[] {
    const onlineUsers: string[] = [];
    
    for (const [userId, status] of this.presenceMap.entries()) {
      if (status.status === 'online') {
        onlineUsers.push(userId);
      }
    }
    
    return onlineUsers;
  }

  /**
   * Periodic cleanup of stale presence data
   */
  @Cron(CronExpression.EVERY_MINUTE)
  cleanupStalePresence(): void {
    const now = Date.now();
    let awayCount = 0;
    let offlineCount = 0;

    for (const [userId, status] of this.presenceMap.entries()) {
      const timeSinceLastSeen = now - status.lastSeen.getTime();

      if (status.status === 'online') {
        if (timeSinceLastSeen > this.OFFLINE_THRESHOLD_MS) {
          status.status = 'offline';
          offlineCount++;
        } else if (timeSinceLastSeen > this.AWAY_THRESHOLD_MS) {
          status.status = 'away';
          awayCount++;
        }
      }
    }

    if (awayCount > 0 || offlineCount > 0) {
      this.logger.debug(`Presence cleanup: ${awayCount} away, ${offlineCount} offline`);
    }
  }

  /**
   * Cleanup expired typing indicators
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  cleanupTypingIndicators(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, indicator] of this.typingMap.entries()) {
      const elapsed = now - indicator.startedAt.getTime();
      if (elapsed > this.TYPING_TIMEOUT_MS) {
        this.typingMap.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired typing indicators`);
    }
  }

  /**
   * Get presence statistics
   */
  getStats(): {
    totalUsers: number;
    online: number;
    away: number;
    offline: number;
    typing: number;
  } {
    let online = 0;
    let away = 0;
    let offline = 0;

    for (const status of this.presenceMap.values()) {
      if (status.status === 'online') online++;
      else if (status.status === 'away') away++;
      else if (status.status === 'offline') offline++;
    }

    return {
      totalUsers: this.presenceMap.size,
      online,
      away,
      offline,
      typing: this.typingMap.size,
    };
  }
}