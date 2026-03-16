import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatSession, ChatMessage, MessageSource, MessageType } from '../database/entities';

export interface CreateChatSessionDto {
  userId: string;
  preferences?: {
    autoComplete?: boolean;
    showTimestamps?: boolean;
    markdownEnabled?: boolean;
    crossPlatformSync?: boolean;
  };
}

export interface AddMessageDto {
  content: string;
  source: MessageSource;
  type: MessageType;
  commandId?: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  private readonly SESSION_TIMEOUT_HOURS = 24;
  private readonly INACTIVE_SESSION_DAYS = 30;
  private readonly MAX_MESSAGES_PER_SESSION = 100;

  constructor(
    @InjectRepository(ChatSession)
    private readonly chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
  ) {}

  /**
   * Create a new chat session for a user
   */
  async createSession(dto: CreateChatSessionDto): Promise<ChatSession> {
    const defaultPreferences = {
      autoComplete: true,
      showTimestamps: true,
      markdownEnabled: true,
      crossPlatformSync: true,
      ...dto.preferences,
    };

    const session = this.chatSessionRepository.create({
      userId: dto.userId,
      preferences: defaultPreferences,
      metadata: {},
    });

    return await this.chatSessionRepository.save(session);
  }

  /**
   * Get or create a chat session for a user
   */
  async getOrCreateSession(userId: string): Promise<ChatSession> {
    let session = await this.chatSessionRepository.findOne({
      where: { userId },
      relations: ['user', 'activeProject'],
    });

    if (!session) {
      const createdSession = await this.createSession({ userId });
      // Reload with relations
      session = await this.chatSessionRepository.findOne({
        where: { id: createdSession.id },
        relations: ['user', 'activeProject'],
      });

      if (!session) {
        session = createdSession;
      }
    }

    return session;
  }

  /**
   * Get a chat session by user ID
   */
  async getSession(userId: string): Promise<ChatSession | null> {
    return await this.chatSessionRepository.findOne({
      where: { userId },
      relations: ['user', 'activeProject'],
    });
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    const session = await this.chatSessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user', 'activeProject'],
    });
    
    return session;
  }

  /**
   * Get summary statistics for a user's current chat session
   */
  async getSessionStats(userId: string): Promise<{
    sessionId: string;
    messageCount: number;
    lastActivity: Date;
    activeProject: string | null;
    createdAt: Date;
  }> {
    const session = await this.getOrCreateSession(userId);

    return {
      sessionId: session.id,
      messageCount: session.messageCount,
      lastActivity: session.lastActivity,
      activeProject: session.activeProjectId,
      createdAt: session.createdAt,
    };
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(userId: string): Promise<void> {
    await this.chatSessionRepository.update(
      { userId },
      { lastActivity: new Date() }
    );
  }

  /**
   * Set the active project for a session
   */
  async setActiveProject(userId: string, projectId: string | null): Promise<void> {
    await this.chatSessionRepository.update(
      { userId },
      { activeProjectId: projectId }
    );
  }

  /**
   * Update session preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<ChatSession['preferences']>
  ): Promise<void> {
    const session = await this.getSession(userId);
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    const updatedPreferences = {
      ...session.preferences,
      ...preferences,
    };

    await this.chatSessionRepository.update(
      { userId },
      { preferences: updatedPreferences }
    );
  }

  /**
   * Add a message to a chat session
   */
  async addMessage(userId: string, dto: AddMessageDto): Promise<ChatMessage> {
    const session = await this.getOrCreateSession(userId);

    // Create the message
    const message = this.chatMessageRepository.create({
      sessionId: session.id,
      userId,
      content: dto.content,
      source: dto.source,
      type: dto.type,
      commandId: dto.commandId,
      projectId: dto.projectId,
      metadata: {
        platform: dto.source,
        ...dto.metadata,
      },
    });

    const savedMessage = await this.chatMessageRepository.save(message);

    // Update session message count and activity
    await this.chatSessionRepository.increment(
      { userId },
      'messageCount',
      1
    );
    await this.updateSessionActivity(userId);

    // Enforce 100 message limit
    await this.enforceMessageLimit(session.id);

    return savedMessage;
  }

  /**
   * Get message history for a user
   */
  async getMessageHistory(
    userId: string,
    limit: number = 100
  ): Promise<ChatMessage[]> {
    const session = await this.getSession(userId);
    if (!session) {
      return [];
    }

    return await this.chatMessageRepository.find({
      where: { sessionId: session.id },
      order: { timestamp: 'DESC' },
      take: limit,
      relations: ['user', 'project'],
    });
  }

  /**
   * Sync a message across platforms
   */
  async syncMessage(userId: string, message: ChatMessage): Promise<void> {
    const session = await this.getSession(userId);
    if (!session || !session.preferences.crossPlatformSync) {
      return;
    }

    // Create a synced copy of the message if it doesn't already exist
    const existingMessage = await this.chatMessageRepository.findOne({
      where: {
        sessionId: session.id,
        source: message.source,
        ...(message.commandId === null
          ? { commandId: IsNull() }
          : { commandId: message.commandId }),
      },
    });

    if (!existingMessage) {
      await this.addMessage(userId, {
        content: message.content,
        source: message.source,
        type: message.type,
        commandId: message.commandId ?? undefined,
        projectId: message.projectId ?? undefined,
        metadata: {
          ...message.metadata,
          synced: true,
        },
      });
    }
  }

  /**
   * Sync message from external source (e.g., Telegram)
   */
  async syncExternalMessage(
    userId: string,
    content: string,
    source: MessageSource,
    type: MessageType,
    metadata: Record<string, any> = {}
  ): Promise<ChatMessage> {
    return await this.addMessage(userId, {
      content,
      source,
      type,
      metadata: {
        ...metadata,
        synced: true,
        external: true,
      },
    });
  }

  /**
   * Get messages that need to be synced to external platforms
   */
  async getMessagesForSync(
    userId: string,
    since: Date,
    targetSource: MessageSource
  ): Promise<ChatMessage[]> {
    const session = await this.getSession(userId);
    if (!session) {
      return [];
    }

    return await this.chatMessageRepository.find({
      where: {
        sessionId: session.id,
        timestamp: MoreThan(since),
        source: targetSource === MessageSource.WEB ? MessageSource.TELEGRAM : MessageSource.WEB,
      },
      order: { timestamp: 'ASC' },
      relations: ['user', 'project'],
    });
  }

  /**
   * Mark messages as synced
   */
  async markMessagesSynced(messageIds: string[]): Promise<void> {
    await this.chatMessageRepository.update(
      messageIds,
      {
        metadata: () => "metadata || '{\"synced\": true}'::jsonb",
      }
    );
  }

  /**
   * Enforce the 100 message limit per session
   */
  private async enforceMessageLimit(sessionId: string): Promise<void> {
    const messageCount = await this.chatMessageRepository.count({
      where: { sessionId },
    });

    if (messageCount > 100) {
      // Get the oldest messages to delete
      const messagesToDelete = await this.chatMessageRepository.find({
        where: { sessionId },
        order: { timestamp: 'ASC' },
        take: messageCount - 100,
        select: ['id'],
      });

      if (messagesToDelete.length > 0) {
        const idsToDelete = messagesToDelete.map(m => m.id);
        await this.chatMessageRepository.delete(idsToDelete);

        // Update the session message count
        await this.chatSessionRepository.update(
          { id: sessionId },
          { messageCount: 100 }
        );
      }
    }
  }

  /**
   * Cleanup inactive sessions (runs every hour)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupInactiveSessions(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.INACTIVE_SESSION_DAYS);

      const result = await this.chatSessionRepository
        .createQueryBuilder()
        .delete()
        .from(ChatSession)
        .where('lastActivity < :cutoffDate', { cutoffDate })
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(`Cleaned up ${result.affected} inactive sessions`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup inactive sessions', error);
    }
  }

  /**
   * Mark sessions as inactive after timeout period
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markTimedOutSessions(): Promise<void> {
    try {
      const timeoutDate = new Date();
      timeoutDate.setHours(timeoutDate.getHours() - this.SESSION_TIMEOUT_HOURS);

      const sessions = await this.chatSessionRepository.find({
        where: { lastActivity: LessThan(timeoutDate) },
      });

      for (const session of sessions) {
        await this.chatSessionRepository.update(session.id, {
          metadata: {
            ...(session.metadata || {}),
            sessionStatus: 'timed_out',
            timedOutAt:
              (session.metadata as Record<string, any> | undefined)?.timedOutAt ||
              new Date().toISOString(),
          },
        });
      }

      if (sessions.length > 0) {
        this.logger.log(`Marked ${sessions.length} sessions as timed out`);
      }
    } catch (error) {
      this.logger.error('Failed to mark timed out sessions', error);
    }
  }

  /**
   * Cleanup old messages beyond the limit
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupOldMessages(): Promise<void> {
    try {
      const sessions = await this.chatSessionRepository.find({
        relations: ['messages'],
      });

      let totalDeleted = 0;

      for (const session of sessions) {
        if (session.messages.length > this.MAX_MESSAGES_PER_SESSION) {
          const messagesToDelete = session.messages
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .slice(0, session.messages.length - this.MAX_MESSAGES_PER_SESSION)
            .map(m => m.id);

          if (messagesToDelete.length > 0) {
            await this.chatMessageRepository.delete(messagesToDelete);
            await this.chatSessionRepository.update(session.id, {
              messageCount: this.MAX_MESSAGES_PER_SESSION,
            });
            totalDeleted += messagesToDelete.length;
          }
        }
      }

      if (totalDeleted > 0) {
        this.logger.log(`Cleaned up ${totalDeleted} old messages`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old messages', error);
    }
  }

  /**
   * Get session timeout configuration
   */
  getSessionTimeoutConfig(): {
    timeoutHours: number;
    inactiveDays: number;
    maxMessages: number;
  } {
    return {
      timeoutHours: this.SESSION_TIMEOUT_HOURS,
      inactiveDays: this.INACTIVE_SESSION_DAYS,
      maxMessages: this.MAX_MESSAGES_PER_SESSION,
    };
  }

  /**
   * Manually expire a session
   */
  async expireSession(sessionId: string): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    await this.chatSessionRepository.update(sessionId, {
      lastActivity: new Date(),
      metadata: {
        ...(session.metadata || {}),
        sessionStatus: 'expired',
        expiredAt: new Date().toISOString(),
      },
    });
    this.logger.log(`Manually expired session ${sessionId}`);
  }

  /**
   * Get messages since a specific message ID (for recovery)
   */
  async getMessagesSince(
    sessionId: string,
    lastMessageId?: string,
  ): Promise<ChatMessage[]> {
    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('message')
      .where('message.sessionId = :sessionId', { sessionId })
      .orderBy('message.timestamp', 'ASC');

    if (lastMessageId) {
      const lastMessage = await this.chatMessageRepository.findOne({
        where: { id: lastMessageId },
      });

      if (lastMessage) {
        queryBuilder.andWhere('message.timestamp > :lastMessageTime', {
          lastMessageTime: lastMessage.timestamp,
        });
      }
    }

    return await queryBuilder.getMany();
  }

  /**
   * Mark session as recovered
   */
  async markSessionRecovered(sessionId: string): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    await this.chatSessionRepository.update(sessionId, {
      lastActivity: new Date(),
      metadata: {
        ...(session.metadata || {}),
        sessionStatus: 'active',
        recoveredAt: new Date().toISOString(),
      },
    });
    this.logger.log(`Session ${sessionId} recovered`);
  }

  async retryFailedMessage(messageId: string): Promise<ChatMessage> {
    const message = await this.chatMessageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    return await this.addMessage(message.userId, {
      content: message.content,
      source: message.source,
      type: message.type,
      commandId: message.commandId ?? undefined,
      projectId: message.projectId ?? undefined,
      metadata: {
        ...(message.metadata || {}),
        commandId: message.commandId ?? undefined,
        projectId: message.projectId ?? undefined,
        retry: true,
        originalMessageId: messageId,
      },
    });
  }
}
