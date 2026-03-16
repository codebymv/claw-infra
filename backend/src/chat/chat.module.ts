import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService } from './web-command-handler.service';
import { WebResponseFormatterService } from './web-response-formatter.service';
import { ChatWebSocketGateway } from './chat-websocket.gateway';
import { ChatSession, ChatMessage, User, Project } from '../database/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatSession,
      ChatMessage,
      User,
      Project,
    ]),
    JwtModule.register({}), // Empty config, will use global JWT config
    ConfigModule,
  ],
  providers: [
    ChatSessionService,
    WebCommandHandlerService,
    WebResponseFormatterService,
    ChatWebSocketGateway,
  ],
  exports: [
    ChatSessionService,
    WebCommandHandlerService,
    WebResponseFormatterService,
    ChatWebSocketGateway,
  ],
})
export class ChatModule {}