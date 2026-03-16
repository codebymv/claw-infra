import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ChatSessionService } from './chat-session.service';
import { WebCommandHandlerService } from './web-command-handler.service';
import { WebResponseFormatterService } from './web-response-formatter.service';
import { ChatWebSocketGateway } from './chat-websocket.gateway';
import { ChatController } from './chat.controller';
import { ChatSession } from '../database/entities/chat-session.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { User } from '../database/entities/user.entity';
import { Project } from '../database/entities/project.entity';
import { PresenceService } from './presence.service';
import { ErrorHandlerService } from './error-handler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatSession,
      ChatMessage,
      User,
      Project,
    ]),
    JwtModule.register({}),
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [ChatController],
  providers: [
    ChatSessionService,
    WebCommandHandlerService,
    WebResponseFormatterService,
    ChatWebSocketGateway,
    PresenceService,
    ErrorHandlerService,
  ],
  exports: [
    ChatSessionService,
    WebCommandHandlerService,
    WebResponseFormatterService,
    ChatWebSocketGateway,
    PresenceService,
    ErrorHandlerService,
  ],
})
export class ChatModule {}
