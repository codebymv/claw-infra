import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService, WebCommandContext, WebCommandResult } from './web-command-handler.service';
import { MessageSource, MessageType } from '../database/entities';
import { PresenceService } from './presence.service';
import { ErrorHandlerService, ChatErrorCode } from './error-handler.service';
import { verifyJwtWithConfiguredSecrets } from '../auth/jwt-verification.util';
import { PubSubService } from '../ws/pubsub.service';

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

interface ChatClientConnection {
  userId: string;
  sessionId: string;
  lastSeen: Date;
  lastActivity: Date;
  isTyping: boolean;
}

@WebSocketGateway({
  cors: { credentials: true },
  namespace: '/chat',
})
export class ChatWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatWebSocketGateway.name);
  private readonly connectedClients = new Map<string, ChatClientConnection>();
  private readonly reconnectionTimeoutMs = 30000; // 30 seconds

  constructor(
    private readonly config: ConfigService,
    private readonly chatSessionService: ChatSessionService,
    private readonly webCommandHandler: WebCommandHandlerService,
    private readonly presenceService: PresenceService,
    private readonly errorHandler: ErrorHandlerService,
    private readonly pubSub: PubSubService,
  ) {}

  afterInit(server: Server) {
    if (!server.engine) {
      this.logger.warn(
        'server.engine not available in afterInit — chat CORS header hook skipped',
      );
      return;
    }

    server.engine.on(
      'headers',
      (_headers: unknown, req: { headers: { origin?: string } }) => {
        const origin = req.headers.origin;
        if (!origin || !this.isAllowedOrigin(origin)) {
          return;
        }

        (_headers as Record<string, string>)['Access-Control-Allow-Origin'] =
          origin;
        (_headers as Record<string, string>)[
          'Access-Control-Allow-Credentials'
        ] = 'true';
      },
    );

    this.logger.log(
      `Chat websocket gateway initialized (allowed origins: ${
        Array.from(this.getAllowedOrigins()).join(', ') || 'none configured'
      })`,
    );

    // Subscribe to global run events and forward to all chat clients as inline status
    this.pubSub.subscribe('global:status', (data: any) => {
      if (data?.runId && data?.status) {
        this.server.emit('chat_event', {
          id: `run_status_${data.runId}_${Date.now()}`,
          type: 'system',
          userId: 'system',
          content: '',
          source: 'web',
          timestamp: new Date().toISOString(),
          metadata: {
            runStatus: true,
            runId: data.runId,
            status: data.status,
            agentName: data.agentName,
            duration: data.duration,
            cost: data.cost,
          },
        });
      }
    });
  }

  private getAllowedOrigins(): Set<string> {
    const frontendUrl = (this.config.get<string>('FRONTEND_URL') || '').trim();
    const additionalOrigins = (this.config.get<string>('CORS_ORIGINS') || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    return new Set([frontendUrl, ...additionalOrigins].filter(Boolean));
  }

  private isAllowedOrigin(origin: string): boolean {
    if (this.getAllowedOrigins().has(origin)) {
      return true;
    }

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return !isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        const error = this.errorHandler.createError(
          ChatErrorCode.AUTH_FAILED,
          'No authentication token provided',
          null,
          false,
        );
        client.emit('error', error);
        client.disconnect();
        return;
      }

      const payload = verifyJwtWithConfiguredSecrets<{ sub?: string; id?: string }>(
        token,
        this.config,
      );
      const userId = payload.sub || payload.id;

      if (!userId) {
        throw new Error('Token payload missing subject');
      }

      // Check error threshold
      if (this.errorHandler.hasExceededErrorThreshold(userId)) {
        const error = this.errorHandler.createError(
          ChatErrorCode.RATE_LIMIT_EXCEEDED,
          'Too many errors. Please try again later.',
          null,
          true,
          60000,
        );
        client.emit('error', error);
        client.disconnect();
        return;
      }

      // Store userId on socket for error handling
      (client as any).userId = userId;

      // Check for existing session recovery
      const existingConnection = Array.from(this.connectedClients.entries())
        .find(([_, data]) => data.userId === userId);

      if (existingConnection) {
        const [oldClientId, oldData] = existingConnection;
        const timeSinceLastSeen = Date.now() - oldData.lastSeen.getTime();

        if (timeSinceLastSeen < this.reconnectionTimeoutMs) {
          this.logger.log(`User ${userId} reconnecting (was disconnected ${timeSinceLastSeen}ms ago)`);
          
          // Emit reconnection event with session recovery data
          client.emit('session:recovered', {
            sessionId: oldData.sessionId,
            reconnected: true,
            downtime: timeSinceLastSeen,
          });
        }

        // Remove old connection
        this.connectedClients.delete(oldClientId);
      }

      const session = await this.chatSessionService.getOrCreateSession(userId);
      
      this.connectedClients.set(client.id, {
        userId,
        sessionId: session.id,
        lastSeen: new Date(),
        lastActivity: new Date(),
        isTyping: false,
      });

      client.join(`user:${userId}`);
      client.join(`session:${session.id}`);

      this.logger.log(`Client ${client.id} connected (user: ${userId}, session: ${session.id})`);

      // Send connection confirmation with session data
      client.emit('connection:established', {
        sessionId: session.id,
        userId,
        messageCount: session.messageCount,
        activeProject: session.activeProjectId,
        preferences: session.preferences,
        timestamp: new Date().toISOString(),
      });

      // Send recent message history so chat persists across refreshes
      try {
        const recentMessages = await this.chatSessionService.getMessageHistory(userId, 50);
        if (recentMessages.length > 0) {
          client.emit('message_history', {
            messages: recentMessages.reverse().map((msg) => ({
              id: msg.id,
              content: msg.content,
              source: msg.source,
              type: msg.type,
              timestamp: msg.timestamp,
              userId: msg.userId,
              metadata: msg.metadata,
            })),
          });
        }
      } catch (historyError) {
        this.logger.warn(`Failed to send message history for user ${userId}:`, historyError);
      }

      // Broadcast user online status
      this.server.to(`user:${userId}`).emit('user:online', { userId });

      // Update presence
      this.presenceService.updatePresence(userId);

      // Broadcast presence update
      this.server.emit('presence:update', {
        userId,
        status: 'online',
        timestamp: new Date(),
      });

    } catch (error) {
      this.errorHandler.handleWebSocketError(client, error, 'handleConnection');
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    
    if (clientData) {
      // Update last seen timestamp for reconnection window
      clientData.lastSeen = new Date();
      
      this.logger.log(`Client ${client.id} disconnected (user: ${clientData.userId})`);

      // Don't immediately remove - allow reconnection window
      setTimeout(() => {
        const stillExists = this.connectedClients.get(client.id);
        if (stillExists && stillExists.lastSeen === clientData.lastSeen) {
          this.connectedClients.delete(client.id);
          this.logger.log(`Client ${client.id} reconnection window expired`);
          
          // Broadcast user offline status
          this.server.to(`user:${clientData.userId}`).emit('user:offline', { 
            userId: clientData.userId 
          });

          // Update presence to offline after timeout
          this.presenceService.setOffline(clientData.userId);

          this.server.emit('presence:update', {
            userId: clientData.userId,
            status: 'offline',
            timestamp: new Date(),
          });
        }
      }, this.reconnectionTimeoutMs);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessagePayload,
  ) {
    const connection = this.connectedClients.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      const { content, type, projectId, metadata } = payload;
      connection.lastActivity = new Date();
      this.connectedClients.set(client.id, connection);

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

  /**
   * Handle typing start
   */
  @SubscribeMessage('typing:start')
  handleTypingStart(@ConnectedSocket() client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (!clientData) return;

    clientData.isTyping = true;
    clientData.lastActivity = new Date();
    this.connectedClients.set(client.id, clientData);
    this.presenceService.startTyping(clientData.userId, clientData.sessionId);

    // Broadcast to session
    client.to(`session:${clientData.sessionId}`).emit('typing:start', {
      userId: clientData.userId,
      sessionId: clientData.sessionId,
    });

    return { success: true };
  }

  /**
   * Handle typing stop
   */
  @SubscribeMessage('typing:stop')
  handleTypingStop(@ConnectedSocket() client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (!clientData) return;

    clientData.isTyping = false;
    clientData.lastActivity = new Date();
    this.connectedClients.set(client.id, clientData);
    this.presenceService.stopTyping(clientData.userId);

    // Broadcast to session
    client.to(`session:${clientData.sessionId}`).emit('typing:stop', {
      userId: clientData.userId,
      sessionId: clientData.sessionId,
    });

    return { success: true };
  }

  @SubscribeMessage('get_session_status')
  async handleGetSessionStatus(
    @ConnectedSocket() client: Socket,
  ) {
    const connection = this.connectedClients.get(client.id);
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
    const connection = this.connectedClients.get(client.id);
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
    const connection = this.connectedClients.get(client.id);
    if (!connection) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      await this.chatSessionService.setActiveProject(connection.userId, payload.projectId);
      
      // Update connection info
      connection.lastActivity = new Date();
      this.connectedClients.set(client.id, connection);

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
    const connections = Array.from(this.connectedClients.values());
    const activeUsers = Array.from(new Set(connections.map(c => c.userId)));
    const typingUsers = connections.filter(c => c.isTyping).map(c => c.userId);
    
    const now = new Date();
    const sessionDurations = connections.map(c => now.getTime() - c.lastActivity.getTime());
    const averageSessionDuration = sessionDurations.length > 0 
      ? sessionDurations.reduce((sum, duration) => sum + duration, 0) / sessionDurations.length
      : 0;

    return {
      totalConnections: this.connectedClients.size,
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

    for (const [clientId, connection] of this.connectedClients.entries()) {
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
    return Array.from(this.connectedClients.entries())
      .filter(([_, connection]) => connection.userId === userId)
      .map(([clientId, _]) => clientId);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return Array.from(this.connectedClients.values())
      .some(connection => connection.userId === userId);
  }

  /**
   * Check if user is typing
   */
  isUserTyping(userId: string): boolean {
    return Array.from(this.connectedClients.values())
      .some(connection => connection.userId === userId && connection.isTyping);
  }

  /**
   * Handle explicit session recovery request
   */
  @SubscribeMessage('session:recover')
  async handleSessionRecover(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; lastMessageId?: string },
  ) {
    try {
      const clientData = this.connectedClients.get(client.id);
      if (!clientData) {
        throw new Error('Client not authenticated');
      }

      const session = await this.chatSessionService.getSessionById(data.sessionId);
      
      if (!session || session.userId !== clientData.userId) {
        const error = this.errorHandler.createError(
          ChatErrorCode.SESSION_NOT_FOUND,
          'Session not found or unauthorized',
          null,
          false,
        );
        client.emit('error', error);
        return { success: false, error };
      }

      const missedMessages = await this.chatSessionService.getMessagesSince(
        data.sessionId,
        data.lastMessageId,
      );

      client.emit('session:recovered', {
        sessionId: session.id,
        missedMessages,
        recoveredAt: new Date(),
      });

      return { success: true, missedMessageCount: missedMessages.length };

    } catch (error) {
      this.errorHandler.handleWebSocketError(client, error, 'handleSessionRecover');
      
      const chatError = this.errorHandler.createError(
        ChatErrorCode.SESSION_RECOVERY_FAILED,
        'Failed to recover session',
        { error: error.message },
        true,
        5000,
      );
      
      return { success: false, error: chatError };
    }
  }

  /**
   * Heartbeat to maintain connection
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      clientData.lastSeen = new Date();
      clientData.lastActivity = new Date();
      this.connectedClients.set(client.id, clientData);
    }
    return { pong: true, timestamp: new Date() };
  }

  /**
   * Get connection status
   */
  @SubscribeMessage('connection:status')
  handleConnectionStatus(@ConnectedSocket() client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    
    return {
      connected: !!clientData,
      userId: clientData?.userId,
      sessionId: clientData?.sessionId,
      lastSeen: clientData?.lastSeen,
    };
  }

  /**
   * Get presence for specific users
   */
  @SubscribeMessage('presence:get')
  handleGetPresence(@MessageBody() data: { userIds: string[] }) {
    const presenceMap = this.presenceService.getMultiplePresence(data.userIds);
    
    return {
      presence: Array.from(presenceMap.values()),
    };
  }

  /**
   * Get typing users in session
   */
  @SubscribeMessage('typing:get')
  handleGetTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const typingUsers = this.presenceService.getTypingUsers(data.sessionId);
    
    return { typingUsers };
  }

  /**
   * Update user activity
   */
  @SubscribeMessage('presence:activity')
  handleActivityUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { activity?: string },
  ) {
    const clientData = this.connectedClients.get(client.id);
    if (!clientData) return;

    clientData.lastSeen = new Date();
    clientData.lastActivity = new Date();
    this.connectedClients.set(client.id, clientData);

    const status = this.presenceService.updatePresence(
      clientData.userId,
      data.activity,
    );

    this.server.emit('presence:update', {
      userId: clientData.userId,
      status: status.status,
      activity: status.currentActivity,
      timestamp: new Date(),
    });

    return { success: true };
  }
}
