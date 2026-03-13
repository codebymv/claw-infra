import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from '../database/entities/project.entity';
import { KanbanBoard } from '../database/entities/kanban-board.entity';
import { ProjectMember } from '../database/entities/project-member.entity';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, KanbanBoard, ProjectMember]),
    WsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}