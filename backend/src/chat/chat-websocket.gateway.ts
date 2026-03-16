import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService, WebCommandContext, WebCommandResult } from './web-command-handler.service';
import { MessageSource, MessageType } from '../database/entities';

export interface ChatMessagePayload {
  content: string;
  type: 'message' | 'command';
  projectId?: string;
  metadata?: Record<string, any>;
}

export interface ChatSubscribePayload {
  userId: string;
  sessionId?: string;
}

export interface ChatEventPayload {
  type: 'message' | 'command' | 'response' | 'system' | 'typing' | 'status';
  messageId?: string;
  userId: string;
  content: string;
  source: 'web' | 'telegram';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ChatTypingPayload {
  userId: string;
  isTyping: boolean;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { credentials: true },
})
export class ChatWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatWebSocketGateway.name);

  // Track client connections and typing status
  private readonly clientConnections = new Map<string, {
    userId: string;
    sessionId?: string;
    lastActivity: Date;
    isTyping: boolean;
  }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly chatSessionService: ChatSessionService,
    private readonly webCommandHandler: WebCommandHandlerService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Chat WS auth rejected: no token (${client.id})`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    try {
      const secret = this.config.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      // Get or create chat session
      const session = await this.chatSessionService.getOrCreateSession(payload.sub);

      // Store client info
      this.clientConnections.set(client.id, {
        userId: payload.sub,
        sessionId: session.id,
        lastActivity: new Date(),
        isTyping: false,
      });

      // Join user-specific room for cross-platform sync
      client.join(`user:${payload.sub}`);

      this.logger.log(
        `Chat WS client authenticated: ${client.id} (user: ${payload.sub})`,
      );

      // Send connection confirmation with session info
      client.emit('connected', {
        status: 'authenticated',
        userId: payload.sub,
        sessionId: session.id,
        messageCount: session.messageCount,
        activeProject: session.activeProjectId,
        preferences: session.preferences,
        timestamp: new Date().toISOString(),
      });

      // Send recent message history
      const recentMessages = await this.chatSessionService.getMessageHistory(payload.sub, 20);
      client.emit('message_history', {
        messages: recentMessages.reverse().map(msg => ({
          id: msg.id,
          content: msg.content,
          source: msg.source,
          type: msg.type,
          timestamp: msg.timestamp.toISOString(),
          metadata: msg.metadata,
        })),
      });

    } catch (error) {
      this.logger.warn(
        `Chat WS auth rejected: invalid token (${client.id})`,
      );
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const connection = this.clientConnections.get(client.id);

    if (connection) {
      // Update session activity
      await this.chatSessionService.updateSessionActivity(connection.userId);

      // Broadcast typing stopped if user was typing
      if (connection.isTyping) {
        await this.broadcastTypingStatus(connection.userId, false);
      }

      this.logger.log(
        `Chat WS client disconnected: ${client.id} (user: ${connection.userId})`,
      );
    }

    // Clean up tracking
    this.clientConnections.delete(client.id);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessagePayload,
  ) {
    const connection = this.clientConnections.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      const { content, type, projectId, metadata } = payload;

      // Create command context
      const context: WebCommandContext = {
        userId: connection.userId,
        sessionId: connection.sessionId,
        activeProjectId: projectId,
        source: 'web',
        metadata,
      };

      // Handle the message through the command handler
      const result = await this.webCommandHandler.handleWebMessage(content, context);

      // Broadcast the user's message to all their connected clients
      await this.broadcastToUser(connection.userId, {
        type: type === 'command' ? 'command' : 'message',
        userId: connection.userId,
        content,
        source: 'web',
        timestamp: new Date().toISOString(),
        metadata,
      });

      // Send the response back to the client
      client.emit('message_response', {
        success: result.success,
        response: result.response,
        error: result.error,
        contextUpdate: result.contextUpdate,
        timestamp: new Date().toISOString(),
      });

      // If successful, also broadcast the response
      if (result.success) {
        await this.broadcastToUser(connection.userId, {
          type: 'response',
          userId: 'system',
          content: result.response.content,
          source: 'web',
          timestamp: new Date().toISOString(),
          metadata: {
            responseType: result.response.type,
            ...result.response.metadata,
          },
        });
      }

      // Update session activity
      await this.chatSessionService.updateSessionActivity(connection.userId);

      return { status: 'ok', messageId: `msg_${Date.now()}` };

    } catch (error) {
      this.logger.error(`Error handling message from ${client.id}:`, error);
      
      client.emit('message_response', {
        success: false,
        response: {
          content: 'An error occurred while processing your message.',
          type: 'text',
        },
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      });

      return { status: 'error', message: 'Message processing failed' };
    }
  }

  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
  ) {
    const connection = this.clientConnections.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    connection.isTyping = true;
    connection.lastActivity = new Date();
    this.clientConnections.set(client.id, connection);

    await this.broadcastTypingStatus(connection.userId, true);

    return { status: 'ok' };
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
  ) {
    const connection = this.clientConnections.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    connection.isTyping = false;
    connection.lastActivity = new Date();
    this.clientConnections.set(client.id, connection);

    await this.broadcastTypingStatus(connection.userId, false);

    return { status: 'ok' };
  }

  @SubscribeMessage('get_session_status')
  async handleGetSessionStatus(
    @ConnectedSocket() client: Socket,
  ) {
    const connection = this.clientConnections.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      const stats = await this.chatSessionService.getSessionStats(connection.userId);
      
      return {
        status: 'ok',
        sessionStats: stats,
        connectionInfo: {
          connected: true,
          lastActivity: connection.lastActivity.toISOString(),
          isTyping: connection.isTyping,
        },
      };
    } catch (error) {
      return { status: 'error', message: 'Failed to get session status' };
    }
  }

  @SubscribeMessage('update_preferences')
  async handleUpdatePreferences(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { preferences: Record<string, any> },
  ) {
    const connection = this.clientConnections.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      await this.chatSessionService.updatePreferences(connection.userId, payload.preferences);
      
      return { status: 'ok', preferences: payload.preferences };
    } catch (error) {
      return { status: 'error', message: 'Failed to update preferences' };
    }
  }

  @SubscribeMessage('set_active_project')
  async handleSetActiveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { projectId: string | null },
  ) {
    const connection = this.clientConnections.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      await this.chatSessionService.setActiveProject(connection.userId, payload.projectId);
      
      // Update connection info
      connection.lastActivity = new Date();
      this.clientConnections.set(client.id, connection);

      // Broadcast context update to all user's clients
      await this.broadcastToUser(connection.userId, {
        type: 'system',
        userId: 'system',
        content: payload.projectId 
          ? `Active project set to: ${payload.projectId}`
          : 'Active project cleared',
        source: 'web',
        timestamp: new Date().toISOString(),
        metadata: {
          contextUpdate: true,
          activeProjectId: payload.projectId,
        },
      });

      return { status: 'ok', activeProjectId: payload.projectId };
    } catch (error) {
      return { status: 'error', message: 'Failed to set active project' };
    }
  }

  // Broadcasting methods

  /**
   * Broadcast message to all of a user's connected clients
   */
  async broadcastToUser(userId: string, event: ChatEventPayload): Promise<void> {
    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit('chat_event', event);
    
    this.logger.debug(`Broadcasted chat event to user ${userId}`);
  }

  /**
   * Broadcast typing status
   */
  async broadcastTypingStatus(userId: string, isTyping: boolean): Promise<void> {
    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit('typing_status', {
      userId,
      isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Sync message from external source (e.g., Telegram)
   */
  async syncExternalMessage(
    userId: string,
    content: string,
    source: 'telegram',
    type: MessageType,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    // Add message to session
    await this.chatSessionService.syncExternalMessage(
      userId,
      content,
      source === 'telegram' ? MessageSource.TELEGRAM : MessageSource.WEB,
      type,
      metadata
    );

    // Broadcast to user's web clients
    await this.broadcastToUser(userId, {
      type: type === MessageType.COMMAND ? 'command' : 'message',
      userId,
      content,
      source,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        synced: true,
        external: true,
      },
    });
  }

  /**
   * Broadcast system message to user
   */
  async broadcastSystemMessage(
    userId: string,
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.broadcastToUser(userId, {
      type: 'system',
      userId: 'system',
      content,
      source: 'web',
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Broadcast connection status update
   */
  async broadcastConnectionStatus(
    userId: string,
    status: 'connected' | 'disconnected' | 'reconnecting',
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.broadcastToUser(userId, {
      type: 'status',
      userId: 'system',
      content: `Connection status: ${status}`,
      source: 'web',
      timestamp: new Date().toISOString(),
      metadata: {
        connectionStatus: status,
        ...metadata,
      },
    });
  }

  // Utility methods

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    activeUsers: string[];
    typingUsers: string[];
    averageSessionDuration: number;
  } {
    const connections = Array.from(this.clientConnections.values());
    const activeUsers = Array.from(new Set(connections.map(c => c.userId)));
    const typingUsers = connections.filter(c => c.isTyping).map(c => c.userId);
    
    const now = new Date();
    const sessionDurations = connections.map(c => now.getTime() - c.lastActivity.getTime());
    const averageSessionDuration = sessionDurations.length > 0 
      ? sessionDurations.reduce((sum, duration) => sum + duration, 0) / sessionDurations.length
      : 0;

    return {
      totalConnections: this.clientConnections.size,
      activeUsers,
      typingUsers,
      averageSessionDuration,
    };
  }

  /**
   * Cleanup inactive connections
   */
  async cleanupInactiveConnections(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    let cleaned = 0;

    for (const [clientId, connection] of this.clientConnections.entries()) {
      if (connection.lastActivity < fiveMinutesAgo) {
        // Find the socket and disconnect it
        const socket = this.server.sockets.sockets.get(clientId);
        if (socket) {
          socket.disconnect(true);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} inactive chat WebSocket connections`);
    }
  }

  /**
   * Get user's active connections
   */
  getUserConnections(userId: string): string[] {
    return Array.from(this.clientConnections.entries())
      .filter(([_, connection]) => connection.userId === userId)
      .map(([clientId, _]) => clientId);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return Array.from(this.clientConnections.values())
      .some(connection => connection.userId === userId);
  }

  /**
   * Check if user is typing
   */
  isUserTyping(userId: string): boolean {
    return Array.from(this.clientConnections.values())
      .some(connection => connection.userId === userId && connection.isTyping);
  }
}