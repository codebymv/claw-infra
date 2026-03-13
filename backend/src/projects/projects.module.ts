import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { SearchService } from './search/search.service';
import { SearchController } from './search/search.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { ProjectAuthService } from './auth/project-auth.service';
import { ProjectAuthGuard } from './auth/project-auth.guard';
import { ProjectAccessGuard } from './auth/project-access.guard';
import { ResourceAccessGuard } from './auth/resource-access.guard';
import { AuditLogService } from './auth/audit-log.service';
import { AgentOrchestratorService } from './agent/agent-orchestrator.service';
import { AgentProjectController } from './agent/agent-project.controller';
import { AgentRateLimiterService } from './agent/agent-rate-limiter.service';
import { ProjectWsModule } from './ws/project-ws.module';
import { Project } from '../database/entities/project.entity';
import { KanbanBoard } from '../database/entities/kanban-board.entity';
import { Column } from '../database/entities/column.entity';
import { Card } from '../database/entities/card.entity';
import { Comment } from '../database/entities/comment.entity';
import { CardHistory } from '../database/entities/card-history.entity';
import { ProjectMember } from '../database/entities/project-member.entity';
import { User } from '../database/entities/user.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { WsModule } from '../ws/ws.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project, 
      KanbanBoard, 
      Column, 
      Card, 
      Comment, 
      CardHistory, 
      ProjectMember, 
      User,
      ApiKey
    ]),
    WsModule,
    AuthModule,
    ProjectWsModule, // Add the project WebSocket module
    JwtModule.register({}), // Empty config, will use global JWT config
    ThrottlerModule.forRoot([{
      name: 'agent-api',
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests per minute
    }]),
  ],
  controllers: [
    ProjectsController, 
    KanbanController, 
    CardsController, 
    CommentsController,
    AgentProjectController,
    SearchController,
    AnalyticsController,
  ],
  providers: [
    ProjectsService, 
    KanbanService, 
    CardsService, 
    CommentsService,
    SearchService,
    AnalyticsService,
    ProjectAuthService,
    ProjectAuthGuard,
    ProjectAccessGuard,
    ResourceAccessGuard,
    AuditLogService,
    AgentOrchestratorService,
    AgentRateLimiterService,
  ],
  exports: [
    ProjectsService, 
    KanbanService, 
    CardsService, 
    CommentsService,
    SearchService,
    AnalyticsService,
    ProjectAuthService,
    AuditLogService,
    AgentOrchestratorService,
    AgentRateLimiterService,
  ],
})
export class ProjectsModule {}