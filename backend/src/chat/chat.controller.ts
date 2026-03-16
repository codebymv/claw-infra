import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService, WebCommandContext } from './web-command-handler.service';
import { MessageSource, MessageType } from '../database/entities';
import { ErrorHandlerService, ChatErrorCode } from './error-handler.service';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface SendMessageDto {
  content: string;
  type: 'message' | 'command';
  projectId?: string;
  metadata?: Record<string, any>;
}

interface UpdatePreferencesDto {
  autoComplete?: boolean;
  showTimestamps?: boolean;
  markdownEnabled?: boolean;
  crossPlatformSync?: boolean;
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatSessionService: ChatSessionService,
    private readonly webCommandHandler: WebCommandHandlerService,
    private readonly errorHandler: ErrorHandlerService,
  ) {}

  /**
   * Get or create chat session for authenticated user
   */
  @Get('session')
  async getSession(@Req() req: AuthenticatedRequest) {
    try {
      const session = await this.chatSessionService.getOrCreateSession(req.user.id);
      
      return {
        sessionId: session.id,
        userId: session.userId,
        messageCount: session.messageCount,
        activeProject: session.activeProjectId,
        preferences: session.preferences,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to get chat session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get message history for authenticated user
   */
  @Get('messages')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    try {
      const messageLimit = limit ? parseInt(limit, 10) : 50;
      
      if (Number.isNaN(messageLimit) || messageLimit < 1 || messageLimit > 100) {
        throw new HttpException(
          'Limit must be between 1 and 100',
          HttpStatus.BAD_REQUEST,
        );
      }

      const messages = await this.chatSessionService.getMessageHistory(
        req.user.id,
        messageLimit,
      );

      return {
        messages: messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          source: msg.source,
          type: msg.type,
          timestamp: msg.timestamp,
          metadata: msg.metadata,
        })),
        count: messages.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get message history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Send a message or command
   */
  @Post('messages')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendMessageDto,
  ) {
    try {
      if (!dto.content || dto.content.trim().length === 0) {
        throw new HttpException(
          'Message content cannot be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Create command context
      const context: WebCommandContext = {
        userId: req.user.id,
        activeProjectId: dto.projectId,
        source: 'web',
        metadata: dto.metadata || {},
      };

      // Handle the message through the command handler
      const result = await this.webCommandHandler.handleWebMessage(
        dto.content,
        context,
      );

      return {
        success: result.success,
        response: result.response,
        error: result.error,
        contextUpdate: result.contextUpdate,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to send message',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get session statistics
   */
  @Get('stats')
  async getSessionStats(@Req() req: AuthenticatedRequest) {
    try {
      const stats = await this.chatSessionService.getSessionStats(req.user.id);
      
      return {
        messageCount: stats.messageCount,
        lastActivity: stats.lastActivity,
        activeProject: stats.activeProject,
        createdAt: stats.createdAt,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to get session statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update session preferences
   */
  @Post('preferences')
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    try {
      await this.chatSessionService.updatePreferences(req.user.id, dto);
      
      return {
        success: true,
        preferences: dto,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to update preferences',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Clear active project
   */
  @Post('project/clear')
  async clearActiveProject(@Req() req: AuthenticatedRequest) {
    try {
      await this.chatSessionService.setActiveProject(req.user.id, null);
      
      return {
        success: true,
        activeProjectId: null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to clear active project',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Set active project
   */
  @Post('project/:projectId')
  async setActiveProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    try {
      await this.chatSessionService.setActiveProject(req.user.id, projectId);
      
      return {
        success: true,
        activeProjectId: projectId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to set active project',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Sync external message (for cross-platform integration)
   */
  @Post('sync')
  async syncExternalMessage(
    @Req() req: AuthenticatedRequest,
    @Body() dto: {
      content: string;
      source: 'telegram';
      type: MessageType;
      metadata?: Record<string, any>;
    },
  ) {
    try {
      const message = await this.chatSessionService.syncExternalMessage(
        req.user.id,
        dto.content,
        dto.source === 'telegram' ? MessageSource.TELEGRAM : MessageSource.WEB,
        dto.type,
        dto.metadata || {},
      );

      return {
        success: true,
        messageId: message.id,
        timestamp: message.timestamp,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to sync external message',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get session timeout configuration
   */
  @Get('config/timeout')
  async getTimeoutConfig() {
    return this.chatSessionService.getSessionTimeoutConfig();
  }

  /**
   * Manually expire current session
   */
  @Post('session/expire')
  async expireSession(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const session = await this.chatSessionService.getOrCreateSession(userId);
    await this.chatSessionService.expireSession(session.id);
    
    return {
      success: true,
      sessionId: session.id,
      message: 'Session expired successfully',
    };
  }

  /**
   * Admin endpoint: Trigger cleanup manually
   */
  @Post('admin/cleanup')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async triggerCleanup() {
    await this.chatSessionService.cleanupInactiveSessions();
    await this.chatSessionService.markTimedOutSessions();
    await this.chatSessionService.cleanupOldMessages();
    
    return {
      success: true,
      message: 'Cleanup tasks triggered successfully',
    };
  }

  /**
   * Recover session and get missed messages
   */
  @Post('session/recover')
  async recoverSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sessionId: string; lastMessageId?: string },
  ) {
    try {
      if (!body.sessionId) {
        throw new HttpException('sessionId is required', HttpStatus.BAD_REQUEST);
      }

      const userId = req.user.id;
      const session = await this.chatSessionService.getSessionById(body.sessionId);

      if (!session || session.userId !== userId) {
        throw new HttpException(
          {
            ...this.errorHandler.createError(
              ChatErrorCode.SESSION_NOT_FOUND,
              'Session not found or unauthorized',
              null,
              false,
            ),
            context: 'recoverSession',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const missedMessages = await this.chatSessionService.getMessagesSince(
        body.sessionId,
        body.lastMessageId,
      );

      await this.chatSessionService.markSessionRecovered(body.sessionId);

      return {
        success: true,
        sessionId: session.id,
        missedMessages,
        recoveredAt: new Date(),
      };

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw this.errorHandler.handleRestError(error, 'recoverSession');
    }
  }

  /**
   * Check if session can be recovered
   */
  @Get('session/:sessionId/recoverable')
  async isSessionRecoverable(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = req.user.id;
    const session = await this.chatSessionService.getSessionById(sessionId);

    if (!session || session.userId !== userId) {
      return { recoverable: false, reason: 'Session not found or unauthorized' };
    }

    const timeoutMs =
      this.chatSessionService.getSessionTimeoutConfig().timeoutHours * 60 * 60 * 1000;
    const timeSinceLastActivity = Date.now() - session.lastActivity.getTime();

    return {
      recoverable: timeSinceLastActivity < timeoutMs,
      sessionId: session.id,
      lastActivity: session.lastActivity,
      timeSinceLastActivity,
    };
  }

  /**
   * Get error statistics (admin only)
   */
  @Get('admin/errors/stats')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Reset error count for user (admin only)
   */
  @Post('admin/errors/reset/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async resetUserErrors(@Param('userId') userId: string) {
    this.errorHandler.resetErrorCount(userId);
    return { success: true, message: `Error count reset for user ${userId}` };
  }

  /**
   * Get error count for current user
   */
  @Get('errors/count')
  async getMyErrorCount(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const count = this.errorHandler.getErrorCount(userId);
    
    return {
      userId,
      errorCount: count,
      threshold: 10,
    };
  }
}
