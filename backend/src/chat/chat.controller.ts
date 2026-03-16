import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService, WebCommandContext } from './web-command-handler.service';
import { MessageSource, MessageType } from '../database/entities';

interface AuthenticatedRequest extends Request {
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
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(
    private readonly chatSessionService: ChatSessionService,
    private readonly webCommandHandler: WebCommandHandlerService,
  ) {}

  /**
   * Get or create chat session for authenticated user
   */
  @Get('session')
  async getSession(@Request() req: AuthenticatedRequest) {
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
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    try {
      const messageLimit = limit ? parseInt(limit, 10) : 50;
      
      if (messageLimit < 1 || messageLimit > 100) {
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
    @Request() req: AuthenticatedRequest,
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
  async getSessionStats(@Request() req: AuthenticatedRequest) {
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
    @Request() req: AuthenticatedRequest,
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
   * Set active project
   */
  @Post('project/:projectId')
  async setActiveProject(
    @Request() req: AuthenticatedRequest,
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
   * Clear active project
   */
  @Post('project/clear')
  async clearActiveProject(@Request() req: AuthenticatedRequest) {
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
   * Sync external message (for cross-platform integration)
   */
  @Post('sync')
  async syncExternalMessage(
    @Request() req: AuthenticatedRequest,
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
}