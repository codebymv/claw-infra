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
import { PubSubService } from '../../ws/pubsub.service';
import { ProjectAuthService } from '../auth/project-auth.service';
import { AuditLogService } from '../auth/audit-log.service';

export interface ProjectSubscribePayload {
  projectId: string;
  channel: 'board' | 'cards' | 'comments' | 'members' | 'activity';
  resourceId?: string; // Optional for specific resource subscriptions
}

export interface ProjectEventPayload {
  type: 'create' | 'update' | 'delete' | 'move' | 'status_change';
  resource: 'project' | 'board' | 'column' | 'card' | 'comment' | 'member';
  resourceId: string;
  projectId: string;
  userId: string;
  timestamp: string;
  data: any;
  metadata?: Record<string, any>;
}

export interface PresencePayload {
  projectId: string;
  boardId?: string;
  cardId?: string;
  action: 'join' | 'leave' | 'typing' | 'viewing';
}

@WebSocketGateway({
  namespace: '/projects',
  cors: { credentials: true },
})
export class ProjectWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ProjectWebSocketGateway.name);

  // Track client subscriptions and presence
  private readonly clientSubscriptions = new Map<string, Set<string>>();
  private readonly clientPresence = new Map<
    string,
    {
      userId: string;
      projectId?: string;
      boardId?: string;
      cardId?: string;
      lastActivity: Date;
    }
  >();

  constructor(
    private readonly pubSub: PubSubService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Project WS auth rejected: no token (${client.id})`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    try {
      const secret = this.config.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      // Store client info
      this.clientSubscriptions.set(client.id, new Set());
      this.clientPresence.set(client.id, {
        userId: payload.sub,
        lastActivity: new Date(),
      });

      this.logger.log(
        `Project WS client authenticated: ${client.id} (user: ${payload.sub})`,
      );

      // Send connection confirmation
      client.emit('connected', {
        status: 'authenticated',
        userId: payload.sub,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Project WS auth rejected: invalid token (${client.id})`,
      );
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const presence = this.clientPresence.get(client.id);

    if (presence) {
      // Broadcast user leaving if they were in a project
      if (presence.projectId) {
        await this.broadcastPresence(presence.projectId, {
          userId: presence.userId,
          action: 'leave',
          projectId: presence.projectId,
          boardId: presence.boardId,
          cardId: presence.cardId,
        });
      }

      await this.auditLogService.logAccess({
        userId: presence.userId,
        action: 'websocket.disconnect',
        resource: 'websocket',
        resourceId: client.id,
        metadata: {
          projectId: presence.projectId,
          sessionDuration: Date.now() - presence.lastActivity.getTime(),
        },
      });
    }

    // Clean up tracking
    this.clientSubscriptions.delete(client.id);
    this.clientPresence.delete(client.id);

    this.logger.log(`Project WS client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_project')
  async handleProjectSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ProjectSubscribePayload,
  ) {
    const presence = this.clientPresence.get(client.id);
    if (!presence) {
      return { status: 'error', message: 'Not authenticated' };
    }

    const { projectId, channel, resourceId } = payload;

    try {
      // Validate project access
      const projectContext =
        await this.projectAuthService.validateProjectAccess(
          projectId,
          presence.userId,
        );

      if (!projectContext.permissions.canRead) {
        return { status: 'error', message: 'Access denied' };
      }

      // Build channel name
      const channelName = resourceId
        ? `project:${projectId}:${channel}:${resourceId}`
        : `project:${projectId}:${channel}`;

      // Join Socket.IO room
      client.join(channelName);

      // Track subscription
      const subscriptions =
        this.clientSubscriptions.get(client.id) || new Set();
      subscriptions.add(channelName);
      this.clientSubscriptions.set(client.id, subscriptions);

      // Update presence
      presence.projectId = projectId;
      presence.lastActivity = new Date();
      this.clientPresence.set(client.id, presence);

      await this.auditLogService.logAccess({
        userId: presence.userId,
        action: 'websocket.subscribe',
        resource: 'project_channel',
        resourceId: channelName,
        projectId,
        metadata: { channel, resourceId },
      });

      this.logger.log(`Client ${client.id} subscribed to ${channelName}`);

      return {
        status: 'ok',
        channel: channelName,
        projectId,
        permissions: projectContext.permissions,
      };
    } catch (error) {
      this.logger.error(
        `Project subscription failed for ${client.id}: ${error.message}`,
      );
      return { status: 'error', message: 'Subscription failed' };
    }
  }

  @SubscribeMessage('unsubscribe_project')
  async handleProjectUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ProjectSubscribePayload,
  ) {
    const { projectId, channel, resourceId } = payload;
    const channelName = resourceId
      ? `project:${projectId}:${channel}:${resourceId}`
      : `project:${projectId}:${channel}`;

    client.leave(channelName);

    const subscriptions = this.clientSubscriptions.get(client.id);
    if (subscriptions?.has(channelName)) {
      subscriptions.delete(channelName);
    }

    return { status: 'ok', channel: channelName };
  }

  @SubscribeMessage('presence_update')
  async handlePresenceUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PresencePayload,
  ) {
    const presence = this.clientPresence.get(client.id);
    if (!presence) {
      return { status: 'error', message: 'Not authenticated' };
    }

    const { projectId, boardId, cardId, action } = payload;

    try {
      // Validate project access
      await this.projectAuthService.validateProjectAccess(
        projectId,
        presence.userId,
      );

      // Update presence tracking
      presence.projectId = projectId;
      presence.boardId = boardId;
      presence.cardId = cardId;
      presence.lastActivity = new Date();
      this.clientPresence.set(client.id, presence);

      // Broadcast presence update
      await this.broadcastPresence(projectId, {
        userId: presence.userId,
        action,
        projectId,
        boardId,
        cardId,
      });

      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', message: 'Access denied' };
    }
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { projectId: string },
  ) {
    const presence = this.clientPresence.get(client.id);
    if (!presence) {
      return { status: 'error', message: 'Not authenticated' };
    }

    try {
      // Validate project access
      await this.projectAuthService.validateProjectAccess(
        payload.projectId,
        presence.userId,
      );

      // Get all users currently in this project
      const onlineUsers = Array.from(this.clientPresence.values())
        .filter((p) => p.projectId === payload.projectId)
        .map((p) => ({
          userId: p.userId,
          boardId: p.boardId,
          cardId: p.cardId,
          lastActivity: p.lastActivity,
        }));

      return {
        status: 'ok',
        projectId: payload.projectId,
        onlineUsers,
        count: onlineUsers.length,
      };
    } catch (error) {
      return { status: 'error', message: 'Access denied' };
    }
  }

  // Broadcasting methods for services to use
  async broadcastProjectEvent(event: ProjectEventPayload): Promise<void> {
    const { projectId, resource, type } = event;

    // Broadcast to general project channel
    const projectChannel = `project:${projectId}:activity`;
    this.server.to(projectChannel).emit('project_event', event);

    // Broadcast to specific resource channels
    const resourceChannel = `project:${projectId}:${this.getResourceChannel(resource)}`;
    this.server.to(resourceChannel).emit(`${resource}_${type}`, event);

    // If it's a specific resource, also broadcast to that resource's channel
    if (event.resourceId && resource !== 'project') {
      const specificChannel = `project:${projectId}:${this.getResourceChannel(resource)}:${event.resourceId}`;
      this.server.to(specificChannel).emit(`${resource}_${type}`, event);
    }

    // Publish to Redis for cross-instance communication
    await this.pubSub.publish(`project:${projectId}`, event);

    this.logger.debug(
      `Broadcasted ${resource}_${type} event for project ${projectId}`,
    );
  }

  async broadcastPresence(
    projectId: string,
    presence: {
      userId: string;
      action: string;
      projectId: string;
      boardId?: string;
      cardId?: string;
    },
  ): Promise<void> {
    const presenceChannel = `project:${projectId}:presence`;
    const presenceEvent = {
      ...presence,
      timestamp: new Date().toISOString(),
    };

    this.server.to(presenceChannel).emit('presence_update', presenceEvent);
    await this.pubSub.publish(`project:${projectId}:presence`, presenceEvent);
  }

  async broadcastCardMove(
    projectId: string,
    cardId: string,
    moveData: {
      fromColumnId: string;
      toColumnId: string;
      fromPosition: number;
      toPosition: number;
      userId: string;
    },
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: 'move',
      resource: 'card',
      resourceId: cardId,
      projectId,
      userId: moveData.userId,
      timestamp: new Date().toISOString(),
      data: moveData,
    };

    await this.broadcastProjectEvent(event);
  }

  async broadcastBoardUpdate(
    projectId: string,
    boardId: string,
    updateData: any,
    userId: string,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: 'update',
      resource: 'board',
      resourceId: boardId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data: updateData,
    };

    await this.broadcastProjectEvent(event);
  }

  async broadcastCommentUpdate(
    projectId: string,
    commentId: string,
    commentData: any,
    userId: string,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: commentData.isNew ? 'create' : 'update',
      resource: 'comment',
      resourceId: commentId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data: commentData,
    };

    await this.broadcastProjectEvent(event);
  }

  async broadcastMemberUpdate(
    projectId: string,
    memberId: string,
    memberData: any,
    userId: string,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: memberData.isNew ? 'create' : 'update',
      resource: 'member',
      resourceId: memberId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data: memberData,
    };

    await this.broadcastProjectEvent(event);
  }

  // Utility methods
  private getResourceChannel(resource: string): string {
    switch (resource) {
      case 'board':
      case 'column':
        return 'board';
      case 'card':
        return 'cards';
      case 'comment':
        return 'comments';
      case 'member':
        return 'members';
      default:
        return 'activity';
    }
  }

  // Health check method
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    activeProjects: string[];
    subscriptionCount: number;
  } {
    const activeProjects = Array.from(
      new Set(
        Array.from(this.clientPresence.values())
          .map((p) => p.projectId)
          .filter((projectId): projectId is string => Boolean(projectId)),
      ),
    );

    const subscriptionCount = Array.from(
      this.clientSubscriptions.values(),
    ).reduce((total, subs) => total + subs.size, 0);

    return {
      totalConnections: this.clientPresence.size,
      authenticatedConnections: this.clientPresence.size,
      activeProjects,
      subscriptionCount,
    };
  }

  // Cleanup method for inactive connections
  async cleanupInactiveConnections(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    let cleaned = 0;

    for (const [clientId, presence] of this.clientPresence.entries()) {
      if (presence.lastActivity < fiveMinutesAgo) {
        // Find the socket and disconnect it
        const socket = this.server.sockets.sockets.get(clientId);
        if (socket) {
          socket.disconnect(true);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} inactive WebSocket connections`);
    }
  }
}
