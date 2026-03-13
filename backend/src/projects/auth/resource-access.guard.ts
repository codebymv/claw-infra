import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectAuthService } from './project-auth.service';

export const RESOURCE_PERMISSION_KEY = 'resourcePermission';
export const RESOURCE_TYPE_KEY = 'resourceType';

export const RequireResourcePermission = (
  resourceType: 'card' | 'board' | 'comment',
  permission: 'read' | 'write' | 'admin' = 'read'
) => {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (propertyKey !== undefined && descriptor !== undefined) {
      SetMetadata(RESOURCE_TYPE_KEY, resourceType)(target, propertyKey, descriptor);
      SetMetadata(RESOURCE_PERMISSION_KEY, permission)(target, propertyKey, descriptor);
    } else {
      SetMetadata(RESOURCE_TYPE_KEY, resourceType)(target);
      SetMetadata(RESOURCE_PERMISSION_KEY, permission)(target);
    }
  };
};

@Injectable()
export class ResourceAccessGuard implements CanActivate {
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

    const resourceType = this.reflector.getAllAndOverride<'card' | 'board' | 'comment'>(
      RESOURCE_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPermission = this.reflector.getAllAndOverride<'read' | 'write' | 'admin'>(
      RESOURCE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    ) || 'read';

    if (!resourceType) {
      // If no resource type specified, fall back to project-level access
      const projectId = request.params.projectId;
      if (!projectId) {
        throw new ForbiddenException('Project ID required');
      }

      const projectContext = await this.projectAuthService.validateProjectAccess(projectId, user.id);
      request.projectContext = projectContext;
      return true;
    }

    try {
      let projectContext;

      switch (resourceType) {
        case 'card':
          const cardId = request.params.cardId;
          if (!cardId) {
            throw new ForbiddenException('Card ID required');
          }
          projectContext = await this.projectAuthService.validateCardAccess(cardId, user.id, requiredPermission);
          break;

        case 'board':
          const boardId = request.params.boardId;
          if (!boardId) {
            throw new ForbiddenException('Board ID required');
          }
          projectContext = await this.projectAuthService.validateBoardAccess(boardId, user.id, requiredPermission);
          break;

        case 'comment':
          const commentId = request.params.commentId;
          if (!commentId) {
            throw new ForbiddenException('Comment ID required');
          }
          projectContext = await this.projectAuthService.validateCommentAccess(commentId, user.id, requiredPermission);
          break;

        default:
          throw new ForbiddenException('Invalid resource type');
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
}