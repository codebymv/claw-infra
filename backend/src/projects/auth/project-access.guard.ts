import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectAuthService } from './project-auth.service';

export const PROJECT_PERMISSION_KEY = 'projectPermission';
export const RequireProjectPermission = (
  permission: 'read' | 'write' | 'admin',
) => SetMetadata(PROJECT_PERMISSION_KEY, permission);

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly projectAuthService: ProjectAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const requiredPermission =
      this.reflector.getAllAndOverride<'read' | 'write' | 'admin'>(
        PROJECT_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      ) || 'read';

    // Extract project ID from route parameters
    const projectId = request.params.projectId || request.params.id;
    if (!projectId) {
      throw new ForbiddenException('Project ID required');
    }

    try {
      const projectContext =
        await this.projectAuthService.validateProjectAccess(projectId, user.id);

      // Check if user has required permission
      if (!this.hasPermission(projectContext.permissions, requiredPermission)) {
        throw new ForbiddenException(
          `Access denied: ${requiredPermission} permission required`,
        );
      }

      // Attach project context to request for use in controllers
      request.projectContext = projectContext;

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Access denied');
    }
  }

  private hasPermission(
    permissions: any,
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
