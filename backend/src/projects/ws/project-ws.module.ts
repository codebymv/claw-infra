import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WsModule } from '../../ws/ws.module';
import { AuthModule } from '../../auth/auth.module';
import { ProjectWebSocketGateway } from './project-websocket.gateway';
import { ProjectPubSubService } from './project-pubsub.service';
import { ProjectAuthService } from '../auth/project-auth.service';
import { AuditLogService } from '../auth/audit-log.service';
import { Project } from '../../database/entities/project.entity';
import { ProjectMember } from '../../database/entities/project-member.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    WsModule, // Import the main WebSocket module for PubSubService
    TypeOrmModule.forFeature([Project, ProjectMember, User]),
  ],
  providers: [
    ProjectWebSocketGateway,
    ProjectPubSubService,
    ProjectAuthService,
    AuditLogService,
  ],
  exports: [ProjectWebSocketGateway, ProjectPubSubService],
})
export class ProjectWsModule {}
