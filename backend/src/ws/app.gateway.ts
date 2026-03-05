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

  constructor(
    private readonly pubSub: PubSubService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    server.engine.on('headers', (_headers: unknown, req: { headers: { origin?: string } }) => {
      const origin = req.headers.origin;
      if (origin === frontendUrl) {
        (_headers as Record<string, string>)['Access-Control-Allow-Origin'] = origin;
        (_headers as Record<string, string>)['Access-Control-Allow-Credentials'] = 'true';
      }
    });

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
      const secret = this.config.get<string>('JWT_SECRET') || 'changeme-in-production';
      this.jwtService.verify(token, { secret });
      this.logger.log(`Client authenticated: ${client.id}`);
    } catch {
      this.logger.warn(`WS auth rejected: invalid token (${client.id})`);
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const { channel } = payload;

    if (!this.isValidChannel(channel)) return;

    client.join(channel);

    if (channel.startsWith('run:') || channel.startsWith('logs:')) {
      this.pubSub.subscribe(channel, (data) => {
        this.server.to(channel).emit(channel, data);
      });
    }

    this.logger.log(`Client ${client.id} subscribed to ${channel}`);
    return { status: 'ok', channel };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const { channel } = payload;
    client.leave(channel);
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
