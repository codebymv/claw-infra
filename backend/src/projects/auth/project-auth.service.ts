import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Project,
  ProjectVisibility,
} from '../../database/entities/project.entity';
import {
  ProjectMember,
  ProjectRole,
} from '../../database/entities/project-member.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { AuthService } from '../../auth/auth.service';
import { CryptoUtil } from '../../auth/crypto.util';

export interface ProjectPermissions {
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  canDelete: boolean;
}

export interface ProjectContext {
  project: Project;
  member?: ProjectMember;
  permissions: ProjectPermissions;
}

@Injectable()
export class ProjectAuthService {
  private readonly logger = new Logger(ProjectAuthService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly authService: AuthService,
  ) {}

  async validateProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectContext> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['owner'],
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // System admins have full access to all projects
    if (user.role === UserRole.ADMIN) {
      return {
        project,
        permissions: {
          canRead: true,
          canWrite: true,
          canAdmin: true,
          canDelete: true,
        },
      };
    }

    // Check if user is project owner
    if (project.ownerId === userId) {
      return {
        project,
        permissions: {
          canRead: true,
          canWrite: true,
          canAdmin: true,
          canDelete: true,
        },
      };
    }

    // Check project visibility for public projects
    if (project.visibility === ProjectVisibility.PUBLIC) {
      return {
        project,
        permissions: {
          canRead: true,
          canWrite: false,
          canAdmin: false,
          canDelete: false,
        },
      };
    }

    // Check project membership
    const member = await this.memberRepo.findOne({
      where: { projectId, userId },
      relations: ['user'],
    });

    if (!member) {
      throw new ForbiddenException('Access denied: not a project member');
    }

    const permissions = this.getPermissionsForRole(member.role);

    return {
      project,
      member,
      permissions,
    };
  }

async validateCardAccess(
    cardId: string,
    userId: string,
    requiredPermission: 'read' | 'write' | 'admin' = 'read',
  ): Promise<ProjectContext> {
    // Get card with project information
    const card = await this.projectRepo.manager
      .createQueryBuilder()
      .select('card.id', 'cardId')
      .addSelect('board.project_id', 'projectId')
      .from('cards', 'card')
      .innerJoin('kanban_boards', 'board', 'board.id = card.board_id')
      .where('card.id = :cardId', { cardId })
      .getRawOne();

    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    const context = await this.validateProjectAccess(card.projectId, userId);

    if (!this.hasPermission(context.permissions, requiredPermission)) {
      throw new ForbiddenException(
        `Access denied: insufficient permissions (${requiredPermission} required)`,
      );
    }

    return context;
  }

    const context = await this.validateProjectAccess(card.id, userId);

    if (!this.hasPermission(context.permissions, requiredPermission)) {
      throw new ForbiddenException(
        `Access denied: insufficient permissions (${requiredPermission} required)`,
      );
    }

    return context;
  }

  async validateBoardAccess(
    boardId: string,
    userId: string,
    requiredPermission: 'read' | 'write' | 'admin' = 'read',
  ): Promise<ProjectContext> {
    // Get board with project information
    const board = await this.projectRepo.manager
      .createQueryBuilder()
      .select('board.id', 'boardId')
      .addSelect('board.project_id', 'projectId')
      .from('kanban_boards', 'board')
      .where('board.id = :boardId', { boardId })
      .getRawOne();

    if (!board) {
      throw new NotFoundException(`Board ${boardId} not found`);
    }

    const context = await this.validateProjectAccess(board.projectId, userId);

    if (!this.hasPermission(context.permissions, requiredPermission)) {
      throw new ForbiddenException(
        `Access denied: insufficient permissions (${requiredPermission} required)`,
      );
    }

    return context;
  }

  async validateCommentAccess(
    commentId: string,
    userId: string,
    requiredPermission: 'read' | 'write' | 'admin' = 'read',
  ): Promise<ProjectContext> {
    // Get comment with project information
    const comment = await this.projectRepo.manager
      .createQueryBuilder()
      .select('comment.id', 'commentId')
      .addSelect('board.project_id', 'projectId')
      .from('comments', 'comment')
      .innerJoin('cards', 'card', 'card.id = comment.card_id')
      .innerJoin('kanban_boards', 'board', 'board.id = card.board_id')
      .where('comment.id = :commentId', { commentId })
      .getRawOne();

    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    const context = await this.validateProjectAccess(comment.projectId, userId);

    if (!this.hasPermission(context.permissions, requiredPermission)) {
      throw new ForbiddenException(
        `Access denied: insufficient permissions (${requiredPermission} required)`,
      );
    }

    return context;
  }

  async canUserAccessProject(
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.validateProjectAccess(projectId, userId);
      return true;
    } catch {
      return false;
    }
  }

  async getUserProjectRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) return null;

    // Check if user is owner
    if (project.ownerId === userId) {
      return ProjectRole.OWNER;
    }

    // Check membership
    const member = await this.memberRepo.findOne({
      where: { projectId, userId },
    });

    return member?.role || null;
  }

  async listUserProjects(userId: string): Promise<Project[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return [];

    // System admins can see all projects
    if (user.role === UserRole.ADMIN) {
      return this.projectRepo.find({
        relations: ['owner'],
        order: { updatedAt: 'DESC' },
      });
    }

    // Get projects where user is owner or member, plus public projects
    return this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoin('project.members', 'member')
      .where('project.ownerId = :userId', { userId })
      .orWhere('member.userId = :userId', { userId })
      .orWhere('project.visibility = :visibility', {
        visibility: ProjectVisibility.PUBLIC,
      })
      .orderBy('project.updatedAt', 'DESC')
      .getMany();
  }

  async createProjectApiKey(
    projectId: string,
    userId: string,
    name: string,
  ): Promise<{ key: string; id: string }> {
    // Validate user has admin access to project
    const context = await this.validateProjectAccess(projectId, userId);
    if (!context.permissions.canAdmin) {
      throw new ForbiddenException(
        'Admin access required to create project API keys',
      );
    }

    // Create API key with project context
    const result = await this.authService.createApiKey(
      `${name} (Project: ${context.project.name})`,
    );

    this.logger.log(
      `Created project API key for project ${projectId} by user ${userId}`,
    );
    return result;
  }

  private getPermissionsForRole(role: ProjectRole): ProjectPermissions {
    switch (role) {
      case ProjectRole.OWNER:
        return {
          canRead: true,
          canWrite: true,
          canAdmin: true,
          canDelete: true,
        };
      case ProjectRole.ADMIN:
        return {
          canRead: true,
          canWrite: true,
          canAdmin: true,
          canDelete: false,
        };
      case ProjectRole.MEMBER:
        return {
          canRead: true,
          canWrite: true,
          canAdmin: false,
          canDelete: false,
        };
      case ProjectRole.VIEWER:
        return {
          canRead: true,
          canWrite: false,
          canAdmin: false,
          canDelete: false,
        };
      default:
        return {
          canRead: false,
          canWrite: false,
          canAdmin: false,
          canDelete: false,
        };
    }
  }

  private hasPermission(
    permissions: ProjectPermissions,
    required: 'read' | 'write' | 'admin',
  ): boolean {
    switch (required) {
      case 'read':
        return permissions.canRead;
      case 'write':
        return permissions.canWrite;
      case 'admin':
        return permissions.canAdmin;
      default:
        return false;
    }
  }
}
