import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryDeepPartialEntity, ILike, In } from 'typeorm';
import {
  Project,
  ProjectStatus,
  ProjectSettings,
} from '../database/entities/project.entity';
import { KanbanBoard } from '../database/entities/kanban-board.entity';
import {
  ProjectMember,
  ProjectRole,
} from '../database/entities/project-member.entity';
import { CodeRepo } from '../database/entities/code-repo.entity';
import { createLikePattern } from '../common/utils/search.util';
import { CodeCommit } from '../database/entities/code-commit.entity';
import { CodePr } from '../database/entities/code-pr.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { AppGateway } from '../ws/app.gateway';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(KanbanBoard)
    private readonly boardRepo: Repository<KanbanBoard>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(CodeRepo)
    private readonly codeRepoRepo: Repository<CodeRepo>,
    @InjectRepository(CodeCommit)
    private readonly commitRepo: Repository<CodeCommit>,
    @InjectRepository(CodePr)
    private readonly prRepo: Repository<CodePr>,
    private readonly gateway: AppGateway,
  ) {}

  async createProject(
    dto: CreateProjectDto,
    ownerId: string,
  ): Promise<Project> {
    // Generate slug if not provided
    const slug = dto.slug || this.generateSlug(dto.name);

    // Check slug uniqueness
    await this.validateSlugUniqueness(slug);

    // Apply default settings
    const defaultSettings: ProjectSettings = {
      allowAgentAccess: true,
      autoArchiveInactiveDays: 90,
      defaultCardTemplate: 'basic',
      workflowRules: [],
      notificationSettings: {
        emailEnabled: true,
        inAppEnabled: true,
        webhookEnabled: false,
      },
    };

    const settings = { ...defaultSettings, ...dto.settings };

    const project = this.projectRepo.create({
      ...dto,
      slug,
      ownerId,
      settings,
    });

    const saved = await this.projectRepo.save(project);

    // Create default kanban board
    await this.createDefaultBoard(saved.id);

    // Add owner as project member
    await this.addProjectMember(saved.id, ownerId, ProjectRole.OWNER);

    const result = await this.getProjectById(saved.id);

    // Broadcast project creation
    this.gateway.broadcastProjectUpdate(saved.id, {
      type: 'project.created',
      project: result,
    });

    this.logger.log(
      `Created project ${saved.id} (${saved.name}) for user ${ownerId}`,
    );
    return result;
  }

  async getProjectById(id: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id, status: ProjectStatus.ACTIVE },
      relations: ['owner', 'boards', 'members', 'members.user'],
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  async getProjectBySlug(slug: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { slug, status: ProjectStatus.ACTIVE },
      relations: ['owner', 'boards', 'members', 'members.user'],
    });

    if (!project) {
      throw new NotFoundException(`Project with slug '${slug}' not found`);
    }

    return project;
  }

  async listProjects(query: ListProjectsQueryDto, userId: string) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const queryBuilder = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoinAndSelect('project.members', 'members')
      .leftJoinAndSelect('members.user', 'memberUser')
      .leftJoinAndSelect('project.boards', 'boards')
      .where('project.status = :status', { status: ProjectStatus.ACTIVE });

    // For API keys (system user), return all projects
    // For regular users, filter by ownership/membership
    if (userId !== 'system') {
      queryBuilder.andWhere('(project.ownerId = :userId OR members.userId = :userId)', {
        userId,
      });
    }

    queryBuilder
      .orderBy('project.updatedAt', 'DESC')
      .skip(skip)
      .take(limit);

    // Apply filters
    if (query.status) {
      queryBuilder.andWhere('project.status = :filterStatus', {
        filterStatus: query.status,
      });
    }

    if (query.visibility) {
      queryBuilder.andWhere('project.visibility = :visibility', {
        visibility: query.visibility,
      });
    }

    if (query.teamId) {
      queryBuilder.andWhere('project.teamId = :teamId', {
        teamId: query.teamId,
      });
    }

    if (query.search) {
      const searchPattern = createLikePattern(query.search, 'contains');
      queryBuilder.andWhere(
        '(project.name ILIKE :search OR project.description ILIKE :search)',
        { search: searchPattern },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async updateProject(
    id: string,
    dto: UpdateProjectDto,
    userId: string,
  ): Promise<Project> {
    const project = await this.getProjectById(id);

    // Check permissions
    await this.validateProjectAccess(project, userId, 'write');

    // Validate slug uniqueness if changing
    if (dto.slug && dto.slug !== project.slug) {
      await this.validateSlugUniqueness(dto.slug, id);
    }

    // Handle status transitions
    if (dto.status && dto.status !== project.status) {
      await this.validateStatusTransition(project.status, dto.status);

      if (dto.status === ProjectStatus.ARCHIVED) {
        (dto as any).archivedAt = new Date();
      } else if (
        project.status === ProjectStatus.ARCHIVED &&
        dto.status === ProjectStatus.ACTIVE
      ) {
        (dto as any).archivedAt = null;
      }
    }

    // Merge settings
    if (dto.settings) {
      dto.settings = { ...project.settings, ...dto.settings };
    }

    await this.projectRepo.update(id, dto as QueryDeepPartialEntity<Project>);
    const updated = await this.getProjectById(id);

    // Broadcast project update
    this.gateway.broadcastProjectUpdate(updated.id, {
      type: 'project.updated',
      project: updated,
    });

    this.logger.log(`Updated project ${id} by user ${userId}`);
    return updated;
  }

  async archiveProject(id: string, userId: string): Promise<Project> {
    return this.updateProject(
      id,
      {
        status: ProjectStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      userId,
    );
  }

  async deleteProject(id: string, userId: string): Promise<void> {
    const project = await this.getProjectById(id);

    // Check permissions - only owner can delete
    if (project.ownerId !== userId) {
      throw new BadRequestException(
        'Only project owner can delete the project',
      );
    }

    await this.projectRepo.update(id, {
      status: ProjectStatus.DELETED,
      archivedAt: new Date(),
    });

    // Broadcast project deletion
    this.gateway.broadcastProjectUpdate(id, {
      type: 'project.deleted',
      projectId: id,
    });

    this.logger.log(`Deleted project ${id} by user ${userId}`);
  }

  async addProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<ProjectMember> {
    // Check if member already exists
    const existing = await this.memberRepo.findOne({
      where: { projectId, userId },
    });

    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }

    const member = this.memberRepo.create({
      projectId,
      userId,
      role,
    });

    const saved = await this.memberRepo.save(member);

    // Broadcast member addition
    this.gateway.broadcastProjectUpdate(projectId, {
      type: 'project.member.added',
      member: saved,
    });

    return saved;
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
    requesterId: string,
  ): Promise<void> {
    const project = await this.getProjectById(projectId);

    // Check permissions
    await this.validateProjectAccess(project, requesterId, 'admin');

    // Cannot remove owner
    if (userId === project.ownerId) {
      throw new BadRequestException('Cannot remove project owner');
    }

    const result = await this.memberRepo.delete({ projectId, userId });

    if (result.affected === 0) {
      throw new NotFoundException('Project member not found');
    }

    // Broadcast member removal
    this.gateway.broadcastProjectUpdate(projectId, {
      type: 'project.member.removed',
      userId,
    });

    this.logger.log(
      `Removed member ${userId} from project ${projectId} by ${requesterId}`,
    );
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  private async validateSlugUniqueness(
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const queryBuilder = this.projectRepo
      .createQueryBuilder('project')
      .where('project.slug = :slug', { slug })
      .andWhere('project.status = :status', { status: ProjectStatus.ACTIVE });

    if (excludeId) {
      queryBuilder.andWhere('project.id != :excludeId', { excludeId });
    }

    const existing = await queryBuilder.getOne();

    if (existing) {
      throw new ConflictException(`Project slug '${slug}' is already taken`);
    }
  }

  private async validateStatusTransition(
    currentStatus: ProjectStatus,
    newStatus: ProjectStatus,
  ): Promise<void> {
    const allowedTransitions: Record<ProjectStatus, ProjectStatus[]> = {
      [ProjectStatus.ACTIVE]: [ProjectStatus.ARCHIVED],
      [ProjectStatus.ARCHIVED]: [ProjectStatus.ACTIVE, ProjectStatus.DELETED],
      [ProjectStatus.DELETED]: [], // No transitions from deleted
    };

    if (!allowedTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} -> ${newStatus}`,
      );
    }
  }

  private async validateProjectAccess(
    project: Project,
    userId: string,
    level: 'read' | 'write' | 'admin',
  ): Promise<void> {
    // Owner has all permissions
    if (project.ownerId === userId) {
      return;
    }

    // Check member permissions
    const member = await this.memberRepo.findOne({
      where: { projectId: project.id, userId },
    });

    if (!member) {
      throw new BadRequestException('Access denied: not a project member');
    }

    const rolePermissions = {
      [ProjectRole.VIEWER]: ['read'],
      [ProjectRole.MEMBER]: ['read', 'write'],
      [ProjectRole.ADMIN]: ['read', 'write', 'admin'],
      [ProjectRole.OWNER]: ['read', 'write', 'admin'],
    };

    if (!rolePermissions[member.role].includes(level)) {
      throw new BadRequestException(
        `Access denied: insufficient permissions (${member.role})`,
      );
    }
  }

  async getLinkedRepos(projectId: string): Promise<CodeRepo[]> {
    try {
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        relations: ['linkedRepos'],
      });
      if (!project) throw new NotFoundException('Project not found');
      return project.linkedRepos ?? [];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      // If join table doesn't exist yet, return empty
      return [];
    }
  }

  async linkRepo(projectId: string, repoFullName: string): Promise<CodeRepo[]> {
    const [owner, name] = repoFullName.split('/');
    if (!owner || !name) {
      throw new BadRequestException('Invalid repo format. Expected owner/name');
    }

    let repo = await this.codeRepoRepo.findOne({ where: { owner, name } });
    if (!repo) {
      // Auto-create the code_repos entry so users can link repos that
      // haven't been backfilled yet.
      repo = this.codeRepoRepo.create({
        provider: 'github',
        owner,
        name,
        isActive: true,
      });
      repo = await this.codeRepoRepo.save(repo);
      this.logger.log(`Auto-created code_repo entry for ${repoFullName}`);
    }

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['linkedRepos'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const alreadyLinked = project.linkedRepos?.some((r) => r.id === repo.id);
    if (alreadyLinked) {
      throw new ConflictException('Repository is already linked to this project');
    }

    project.linkedRepos = [...(project.linkedRepos ?? []), repo];
    await this.projectRepo.save(project);

    this.logger.log(`Linked repo ${repoFullName} to project ${projectId}`);
    return project.linkedRepos;
  }

  async unlinkRepo(projectId: string, repoId: string): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['linkedRepos'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const before = project.linkedRepos?.length ?? 0;
    project.linkedRepos = (project.linkedRepos ?? []).filter((r) => r.id !== repoId);
    if (project.linkedRepos.length === before) {
      throw new NotFoundException('Repository not linked to this project');
    }

    await this.projectRepo.save(project);
    this.logger.log(`Unlinked repo ${repoId} from project ${projectId}`);
  }

  async getProjectActivity(
    projectId: string,
    limit = 20,
  ): Promise<{ commits: CodeCommit[]; prs: CodePr[] }> {
    const repos = await this.getLinkedRepos(projectId);
    if (repos.length === 0) return { commits: [], prs: [] };

    const repoIds = repos.map((r) => r.id);

    const [commits, prs] = await Promise.all([
      this.commitRepo.find({
        where: { repoId: In(repoIds) },
        order: { committedAt: 'DESC' },
        take: limit,
      }),
      this.prRepo.find({
        where: { repoId: In(repoIds) },
        order: { openedAt: 'DESC' },
        take: limit,
      }),
    ]);

    return { commits, prs };
  }

  private async createDefaultBoard(projectId: string): Promise<KanbanBoard> {
    const board = this.boardRepo.create({
      projectId,
      name: 'Main Board',
      description: 'Default kanban board',
      isDefault: true,
    });

    return this.boardRepo.save(board);
  }
}
