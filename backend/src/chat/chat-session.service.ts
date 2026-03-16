import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
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
      session = await this.createSession({ userId });
      // Reload with relations
      session = await this.chatSessionRepository.findOne({
        where: { id: session.id },
        relations: ['user', 'activeProject'],
      });
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
        commandId: message.commandId,
        source: message.source,
      },
    });

    if (!existingMessage) {
      await this.addMessage(userId, {
        content: message.content,
        source: message.source,
        type: message.type,
        commandId: message.commandId,
        projectId: message.projectId,
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
   * Clean up old inactive sessions
   */
  async cleanupOldSessions(daysInactive: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const oldSessions = await this.chatSessionRepository.find({
      where: {
        lastActivity: MoreThan(cutoffDate),
      },
      select: ['id'],
    });

    if (oldSessions.length > 0) {
      const sessionIds = oldSessions.map(s => s.id);
      
      // Delete messages first (due to foreign key constraints)
      await this.chatMessageRepository.delete({
        sessionId: In(sessionIds),
      });
      
      // Then delete sessions
      await this.chatSessionRepository.delete(sessionIds);
    }

    return oldSessions.length;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId: string): Promise<{
    messageCount: number;
    lastActivity: Date;
    activeProject: string | null;
    createdAt: Date;
  }> {
    const session = await this.getSession(userId);
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    return {
      messageCount: session.messageCount,
      lastActivity: session.lastActivity,
      activeProject: session.activeProjectId,
      createdAt: session.createdAt,
    };
  }
}