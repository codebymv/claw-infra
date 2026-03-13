import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async createProject(@Body() dto: CreateProjectDto, @Request() req) {
    return this.projectsService.createProject(dto, req.user.id);
  }

  @Get()
  async listProjects(@Query() query: ListProjectsQueryDto, @Request() req) {
    return this.projectsService.listProjects(query, req.user.id);
  }

  @Get(':id')
  async getProject(@Param('id') id: string) {
    return this.projectsService.getProjectById(id);
  }

  @Get('slug/:slug')
  async getProjectBySlug(@Param('slug') slug: string) {
    return this.projectsService.getProjectBySlug(slug);
  }

  @Put(':id')
  async updateProject(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Request() req,
  ) {
    return this.projectsService.updateProject(id, dto, req.user.id);
  }

  @Put(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archiveProject(@Param('id') id: string, @Request() req) {
    return this.projectsService.archiveProject(id, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProject(@Param('id') id: string, @Request() req) {
    await this.projectsService.deleteProject(id, req.user.id);
  }

  @Post(':id/members')
  async addProjectMember(
    @Param('id') projectId: string,
    @Body() body: { userId: string; role: string },
    @Request() req,
  ) {
    return this.projectsService.addProjectMember(projectId, body.userId, body.role as any);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeProjectMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    await this.projectsService.removeProjectMember(projectId, userId, req.user.id);
  }
}