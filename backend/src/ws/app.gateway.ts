import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PubSubService } from './pubsub.service';

interface SubscribePayload {
  channel: string;
}

@WebSocketGateway({
  // CORS origin is applied dynamically in afterInit via server.engine options
  // to avoid reading process.env before the NestJS ConfigService is ready.
  cors: { credentials: true },
  namespace: '/',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppGateway.name);

  // Track per-client channel memberships so we can cleanup on disconnect
  private readonly clientChannels = new Map<string, Set<string>>();

  // Track dynamic channel subscribers to avoid duplicate Redis handlers / leaks
  private readonly dynamicChannelRefCounts = new Map<string, number>();
  private readonly dynamicChannelHandlers = new Map<string, (data: unknown) => void>();

  constructor(
    private readonly pubSub: PubSubService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    if (server.engine) {
      server.engine.on('headers', (_headers: unknown, req: { headers: { origin?: string } }) => {
        const origin = req.headers.origin;
        if (origin === frontendUrl) {
          (_headers as Record<string, string>)['Access-Control-Allow-Origin'] = origin;
          (_headers as Record<string, string>)['Access-Control-Allow-Credentials'] = 'true';
        }
      });
    } else {
      this.logger.warn('server.engine not available in afterInit — CORS header hook skipped');
    }

    this.pubSub.subscribe('global:status', (data) => {
      server.to('global:status').emit('global:status', data);
    });

    this.pubSub.subscribe('resources:live', (data) => {
      server.to('resources:live').emit('resources:live', data);
    });

    this.logger.log(`WebSocket gateway initialized (CORS origin: ${frontendUrl})`);
  }

  handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`WS auth rejected: no token (${client.id})`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    try {
      const secret = this.config.get<string>('JWT_SECRET');
      this.jwtService.verify(token, { secret });
      this.clientChannels.set(client.id, new Set());
      this.logger.log(`Client authenticated: ${client.id}`);
    } catch {
      this.logger.warn(`WS auth rejected: invalid token (${client.id})`);
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.cleanupClientSubscriptions(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: SubscribePayload) {
    const channel = payload?.channel;

    if (!channel || !this.isValidChannel(channel)) {
      return { status: 'error', message: 'Invalid channel' };
    }

    const channels = this.clientChannels.get(client.id) || new Set<string>();
    if (channels.has(channel)) {
      return { status: 'ok', channel };
    }

    client.join(channel);
    channels.add(channel);
    this.clientChannels.set(client.id, channels);

    if (this.isDynamicChannel(channel)) {
      this.addDynamicChannelSubscription(channel);
    }

    this.logger.log(`Client ${client.id} subscribed to ${channel}`);
    return { status: 'ok', channel };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: SubscribePayload) {
    const channel = payload?.channel;

    if (!channel || !this.isValidChannel(channel)) {
      return { status: 'error', message: 'Invalid channel' };
    }

    client.leave(channel);

    const channels = this.clientChannels.get(client.id);
    if (channels?.has(channel)) {
      channels.delete(channel);
      if (this.isDynamicChannel(channel)) {
        this.removeDynamicChannelSubscription(channel);
      }
    }

    return { status: 'ok', channel };
  }

  private isValidChannel(channel: string): boolean {
    return (
      channel === 'global:status' ||
      channel === 'resources:live' ||
      /^run:[a-f0-9-]{36}$/.test(channel) ||
      /^logs:[a-f0-9-]{36}$/.test(channel)
    );
  }

  private isDynamicChannel(channel: string): boolean {
    return channel.startsWith('run:') || channel.startsWith('logs:');
  }

  private addDynamicChannelSubscription(channel: string): void {
    const current = this.dynamicChannelRefCounts.get(channel) || 0;
    const next = current + 1;
    this.dynamicChannelRefCounts.set(channel, next);

    if (current === 0) {
      const handler = (data: unknown) => {
        this.server.to(channel).emit(channel, data);
      };
      this.dynamicChannelHandlers.set(channel, handler);
      this.pubSub.subscribe(channel, handler);
    }
  }

  private removeDynamicChannelSubscription(channel: string): void {
    const current = this.dynamicChannelRefCounts.get(channel) || 0;
    if (current <= 1) {
      this.dynamicChannelRefCounts.delete(channel);
      const handler = this.dynamicChannelHandlers.get(channel);
      if (handler) {
        this.pubSub.unsubscribe(channel, handler);
        this.dynamicChannelHandlers.delete(channel);
      }
      return;
    }

    this.dynamicChannelRefCounts.set(channel, current - 1);
  }

  private cleanupClientSubscriptions(clientId: string): void {
    const channels = this.clientChannels.get(clientId);
    if (!channels) return;

    for (const channel of channels) {
      if (this.isDynamicChannel(channel)) {
        this.removeDynamicChannelSubscription(channel);
      }
    }

    this.clientChannels.delete(clientId);
  }

  broadcastRunUpdate(runId: string, data: unknown) {
    this.pubSub.publish(`run:${runId}`, data);
    this.pubSub.publish('global:status', data);
  }

  broadcastLog(runId: string, data: unknown) {
    this.pubSub.publish(`logs:${runId}`, data);
  }

  broadcastResourceUpdate(data: unknown) {
    this.pubSub.publish('resources:live', data);
  }
}
