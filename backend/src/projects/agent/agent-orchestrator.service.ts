import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../database/entities/project.entity';
import { Card } from '../../database/entities/card.entity';
import { User } from '../../database/entities/user.entity';
import { ProjectAuthService } from '../auth/project-auth.service';
import { AuditLogService } from '../auth/audit-log.service';

export interface AgentWorkspace {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  status: 'active' | 'idle' | 'terminated';
  resources: {
    cardIds: string[];
    boardIds: string[];
    maxConcurrentOperations: number;
  };
  metadata: {
    createdAt: Date;
    lastActivity: Date;
    operationCount: number;
    conflictCount: number;
  };
}

export interface AgentOperation {
  id: string;
  workspaceId: string;
  type: 'create' | 'update' | 'delete' | 'move';
  resourceType: 'card' | 'board' | 'column' | 'comment';
  resourceId: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'conflicted';
  priority: number;
  metadata: Record<string, any>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ConflictResolution {
  conflictId: string;
  strategy: 'merge' | 'override' | 'queue' | 'abort';
  winnerWorkspaceId?: string;
  metadata: Record<string, any>;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private readonly workspaces = new Map<string, AgentWorkspace>();
  private readonly operations = new Map<string, AgentOperation>();
  private readonly conflicts = new Map<string, ConflictResolution>();

  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(Card) private readonly cardRepo: Repository<Card>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly projectAuthService: ProjectAuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createWorkspace(
    projectId: string,
    agentId: string,
    agentName: string,
    maxConcurrentOperations = 5
  ): Promise<AgentWorkspace> {
    // Validate project exists and agent has access
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Check if workspace already exists for this agent in this project
    const existingWorkspace = Array.from(this.workspaces.values()).find(
      ws => ws.projectId === projectId && ws.agentId === agentId
    );

    if (existingWorkspace) {
      if (existingWorkspace.status === 'terminated') {
        // Reactivate terminated workspace
        existingWorkspace.status = 'active';
        existingWorkspace.metadata.lastActivity = new Date();
        return existingWorkspace;
      } else {
        throw new ConflictException(`Agent ${agentId} already has an active workspace in project ${projectId}`);
      }
    }

    const workspace: AgentWorkspace = {
      id: `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      agentId,
      agentName,
      status: 'active',
      resources: {
        cardIds: [],
        boardIds: [],
        maxConcurrentOperations,
      },
      metadata: {
        createdAt: new Date(),
        lastActivity: new Date(),
        operationCount: 0,
        conflictCount: 0,
      },
    };

    this.workspaces.set(workspace.id, workspace);

    await this.auditLogService.logAccess({
      userId: agentId,
      action: 'workspace.create',
      resource: 'workspace',
      resourceId: workspace.id,
      projectId,
      metadata: { agentName, maxConcurrentOperations },
    });

    this.logger.log(`Created workspace ${workspace.id} for agent ${agentName} in project ${projectId}`);
    return workspace;
  }

  async getWorkspace(workspaceId: string): Promise<AgentWorkspace> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  async listWorkspaces(projectId?: string, agentId?: string): Promise<AgentWorkspace[]> {
    const workspaces = Array.from(this.workspaces.values());
    
    return workspaces.filter(ws => {
      if (projectId && ws.projectId !== projectId) return false;
      if (agentId && ws.agentId !== agentId) return false;
      return true;
    });
  }

  async terminateWorkspace(workspaceId: string, reason = 'manual'): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    // Cancel all pending operations
    const pendingOps = Array.from(this.operations.values()).filter(
      op => op.workspaceId === workspaceId && op.status === 'pending'
    );

    for (const op of pendingOps) {
      op.status = 'failed';
      op.completedAt = new Date();
      op.metadata.failureReason = `Workspace terminated: ${reason}`;
    }

    workspace.status = 'terminated';
    workspace.metadata.lastActivity = new Date();

    await this.auditLogService.logAccess({
      userId: workspace.agentId,
      action: 'workspace.terminate',
      resource: 'workspace',
      resourceId: workspaceId,
      projectId: workspace.projectId,
      metadata: { reason, pendingOperations: pendingOps.length },
    });

    this.logger.log(`Terminated workspace ${workspaceId} for agent ${workspace.agentName}: ${reason}`);
  }

  async allocateResource(
    workspaceId: string,
    resourceType: 'card' | 'board',
    resourceId: string
  ): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    if (workspace.status !== 'active') {
      return false;
    }

    // Check if resource is already allocated to another workspace
    const conflictingWorkspace = Array.from(this.workspaces.values()).find(ws => {
      if (ws.id === workspaceId || ws.status !== 'active') return false;
      
      if (resourceType === 'card') {
        return ws.resources.cardIds.includes(resourceId);
      } else if (resourceType === 'board') {
        return ws.resources.boardIds.includes(resourceId);
      }
      return false;
    });

    if (conflictingWorkspace) {
      // Create conflict resolution
      const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.conflicts.set(conflictId, {
        conflictId,
        strategy: 'queue', // Default strategy
        metadata: {
          resourceType,
          resourceId,
          requestingWorkspace: workspaceId,
          conflictingWorkspace: conflictingWorkspace.id,
          createdAt: new Date(),
        },
      });

      workspace.metadata.conflictCount++;
      
      this.logger.warn(`Resource conflict detected: ${resourceType}:${resourceId} between workspaces ${workspaceId} and ${conflictingWorkspace.id}`);
      return false;
    }

    // Allocate resource
    if (resourceType === 'card') {
      workspace.resources.cardIds.push(resourceId);
    } else if (resourceType === 'board') {
      workspace.resources.boardIds.push(resourceId);
    }

    workspace.metadata.lastActivity = new Date();

    await this.auditLogService.logAccess({
      userId: workspace.agentId,
      action: 'resource.allocate',
      resource: resourceType,
      resourceId,
      projectId: workspace.projectId,
      metadata: { workspaceId },
    });

    return true;
  }

  async releaseResource(
    workspaceId: string,
    resourceType: 'card' | 'board',
    resourceId: string
  ): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    if (resourceType === 'card') {
      workspace.resources.cardIds = workspace.resources.cardIds.filter(id => id !== resourceId);
    } else if (resourceType === 'board') {
      workspace.resources.boardIds = workspace.resources.boardIds.filter(id => id !== resourceId);
    }

    workspace.metadata.lastActivity = new Date();

    await this.auditLogService.logAccess({
      userId: workspace.agentId,
      action: 'resource.release',
      resource: resourceType,
      resourceId,
      projectId: workspace.projectId,
      metadata: { workspaceId },
    });

    // Check if any queued operations can now proceed
    await this.processQueuedOperations(resourceType, resourceId);
  }

  async queueOperation(
    workspaceId: string,
    type: AgentOperation['type'],
    resourceType: AgentOperation['resourceType'],
    resourceId: string,
    metadata: Record<string, any> = {},
    priority = 0
  ): Promise<AgentOperation> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    if (workspace.status !== 'active') {
      throw new ConflictException(`Workspace ${workspaceId} is not active`);
    }

    const operation: AgentOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      type,
      resourceType,
      resourceId,
      status: 'pending',
      priority,
      metadata,
      createdAt: new Date(),
    };

    this.operations.set(operation.id, operation);
    workspace.metadata.operationCount++;
    workspace.metadata.lastActivity = new Date();

    this.logger.log(`Queued operation ${operation.id}: ${type} ${resourceType}:${resourceId} for workspace ${workspaceId}`);
    return operation;
  }

  async executeOperation(operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new NotFoundException(`Operation ${operationId} not found`);
    }

    const workspace = this.workspaces.get(operation.workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${operation.workspaceId} not found`);
    }

    if (operation.status !== 'pending') {
      throw new ConflictException(`Operation ${operationId} is not pending`);
    }

    // Check resource allocation
    const resourceAllocated = await this.allocateResource(
      operation.workspaceId,
      operation.resourceType === 'card' ? 'card' : 'board',
      operation.resourceId
    );

    if (!resourceAllocated) {
      operation.status = 'conflicted';
      operation.metadata.conflictReason = 'Resource allocation failed';
      return;
    }

    operation.status = 'executing';
    operation.startedAt = new Date();

    try {
      // Here you would integrate with the actual service methods
      // For now, we'll simulate the operation
      await new Promise(resolve => setTimeout(resolve, 100));

      operation.status = 'completed';
      operation.completedAt = new Date();

      await this.auditLogService.logAccess({
        userId: workspace.agentId,
        action: `operation.${operation.type}`,
        resource: operation.resourceType,
        resourceId: operation.resourceId,
        projectId: workspace.projectId,
        metadata: { operationId, workspaceId: workspace.id },
      });

    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date();
      operation.metadata.error = error.message;

      this.logger.error(`Operation ${operationId} failed: ${error.message}`);
    } finally {
      // Release resource after operation
      await this.releaseResource(
        operation.workspaceId,
        operation.resourceType === 'card' ? 'card' : 'board',
        operation.resourceId
      );
    }
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new NotFoundException(`Conflict ${conflictId} not found`);
    }

    this.conflicts.set(conflictId, { ...conflict, ...resolution });

    await this.auditLogService.logAccess({
      userId: 'system',
      action: 'conflict.resolve',
      resource: 'conflict',
      resourceId: conflictId,
      metadata: resolution,
    });

    this.logger.log(`Resolved conflict ${conflictId} with strategy: ${resolution.strategy}`);
  }

  async getWorkspaceStats(workspaceId: string): Promise<{
    workspace: AgentWorkspace;
    operations: {
      total: number;
      pending: number;
      executing: number;
      completed: number;
      failed: number;
      conflicted: number;
    };
    resources: {
      allocated: number;
      conflicts: number;
    };
  }> {
    const workspace = await this.getWorkspace(workspaceId);
    const operations = Array.from(this.operations.values()).filter(op => op.workspaceId === workspaceId);
    
    return {
      workspace,
      operations: {
        total: operations.length,
        pending: operations.filter(op => op.status === 'pending').length,
        executing: operations.filter(op => op.status === 'executing').length,
        completed: operations.filter(op => op.status === 'completed').length,
        failed: operations.filter(op => op.status === 'failed').length,
        conflicted: operations.filter(op => op.status === 'conflicted').length,
      },
      resources: {
        allocated: workspace.resources.cardIds.length + workspace.resources.boardIds.length,
        conflicts: workspace.metadata.conflictCount,
      },
    };
  }

  private async processQueuedOperations(resourceType: string, resourceId: string): Promise<void> {
    // Find operations waiting for this resource
    const queuedOps = Array.from(this.operations.values()).filter(op => 
      op.status === 'conflicted' && 
      op.resourceId === resourceId &&
      (op.resourceType === resourceType || (resourceType === 'board' && op.resourceType === 'card'))
    );

    // Sort by priority and creation time
    queuedOps.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Try to execute the highest priority operation
    if (queuedOps.length > 0) {
      const nextOp = queuedOps[0];
      nextOp.status = 'pending';
      delete nextOp.metadata.conflictReason;
      
      this.logger.log(`Requeued operation ${nextOp.id} after resource ${resourceType}:${resourceId} was released`);
    }
  }

  async cleanup(): Promise<void> {
    // Clean up terminated workspaces and completed operations older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Remove old terminated workspaces
    for (const [id, workspace] of this.workspaces.entries()) {
      if (workspace.status === 'terminated' && workspace.metadata.lastActivity < oneHourAgo) {
        this.workspaces.delete(id);
      }
    }

    // Remove old completed operations
    for (const [id, operation] of this.operations.entries()) {
      if (operation.completedAt && operation.completedAt < oneHourAgo) {
        this.operations.delete(id);
      }
    }

    // Remove old resolved conflicts
    for (const [id, conflict] of this.conflicts.entries()) {
      const createdAt = conflict.metadata.createdAt as Date;
      if (createdAt && createdAt < oneHourAgo) {
        this.conflicts.delete(id);
      }
    }

    this.logger.log('Completed workspace cleanup');
  }
}