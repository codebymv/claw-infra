import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PubSubService } from '../../ws/pubsub.service';
import { ProjectEventPayload } from './project-websocket.gateway';

export interface ProjectEventFilter {
  projectId?: string;
  resourceType?: string;
  eventType?: string;
  userId?: string;
}

export interface ProjectChannelSubscription {
  id: string;
  projectId: string;
  channel: string;
  filter?: ProjectEventFilter;
  handler: (event: ProjectEventPayload) => void | Promise<void>;
  createdAt: Date;
}

@Injectable()
export class ProjectPubSubService implements OnModuleInit {
  private readonly logger = new Logger(ProjectPubSubService.name);
  private readonly subscriptions = new Map<
    string,
    ProjectChannelSubscription
  >();
  private subscriptionCounter = 0;

  constructor(private readonly pubSub: PubSubService) {}

  onModuleInit() {
    // Subscribe to all project events using pattern subscription
    this.pubSub.psubscribe('project:*', (channel: string, data: any) => {
      this.handleProjectEvent(channel, data);
    });

    this.logger.log('Project PubSub service initialized');
  }

  private async handleProjectEvent(channel: string, data: any): Promise<void> {
    try {
      // Parse channel to extract project ID and event type
      const channelParts = channel.split(':');
      if (channelParts.length < 2 || channelParts[0] !== 'project') {
        return;
      }

      const projectId = channelParts[1];
      const event = data as ProjectEventPayload;

      // Find matching subscriptions
      const matchingSubscriptions = Array.from(
        this.subscriptions.values(),
      ).filter((sub) => this.matchesFilter(sub, projectId, event));

      // Execute handlers
      for (const subscription of matchingSubscriptions) {
        try {
          await subscription.handler(event);
        } catch (error) {
          this.logger.error(
            `Error in subscription handler ${subscription.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error handling project event from ${channel}: ${error.message}`,
      );
    }
  }

  private matchesFilter(
    subscription: ProjectChannelSubscription,
    projectId: string,
    event: ProjectEventPayload,
  ): boolean {
    // Check project ID match
    if (subscription.projectId !== projectId) {
      return false;
    }

    // Check filter criteria if provided
    if (subscription.filter) {
      const filter = subscription.filter;

      if (filter.projectId && filter.projectId !== event.projectId) {
        return false;
      }

      if (filter.resourceType && filter.resourceType !== event.resource) {
        return false;
      }

      if (filter.eventType && filter.eventType !== event.type) {
        return false;
      }

      if (filter.userId && filter.userId !== event.userId) {
        return false;
      }
    }

    return true;
  }

  // Subscribe to project events with optional filtering
  subscribeToProject(
    projectId: string,
    handler: (event: ProjectEventPayload) => void | Promise<void>,
    options?: {
      channel?: string;
      filter?: ProjectEventFilter;
    },
  ): string {
    const subscriptionId = `sub_${++this.subscriptionCounter}_${Date.now()}`;

    const subscription: ProjectChannelSubscription = {
      id: subscriptionId,
      projectId,
      channel: options?.channel || 'all',
      filter: options?.filter,
      handler,
      createdAt: new Date(),
    };

    this.subscriptions.set(subscriptionId, subscription);

    this.logger.log(
      `Created project subscription ${subscriptionId} for project ${projectId}`,
    );
    return subscriptionId;
  }

  // Subscribe to specific resource events
  subscribeToResource(
    projectId: string,
    resourceType: 'card' | 'board' | 'column' | 'comment' | 'member',
    handler: (event: ProjectEventPayload) => void | Promise<void>,
    options?: {
      resourceId?: string;
      eventTypes?: string[];
      userId?: string;
    },
  ): string {
    const filter: ProjectEventFilter = {
      projectId,
      resourceType,
      userId: options?.userId,
    };

    return this.subscribeToProject(
      projectId,
      (event) => {
        // Additional filtering for resource ID and event types
        if (options?.resourceId && event.resourceId !== options.resourceId) {
          return;
        }

        if (options?.eventTypes && !options.eventTypes.includes(event.type)) {
          return;
        }

        return handler(event);
      },
      { filter },
    );
  }

  // Subscribe to card events specifically
  subscribeToCardEvents(
    projectId: string,
    handler: (event: ProjectEventPayload) => void | Promise<void>,
    options?: {
      cardId?: string;
      eventTypes?: ('create' | 'update' | 'delete' | 'move')[];
    },
  ): string {
    return this.subscribeToResource(projectId, 'card', handler, {
      resourceId: options?.cardId,
      eventTypes: options?.eventTypes,
    });
  }

  // Subscribe to comment events specifically
  subscribeToCommentEvents(
    projectId: string,
    handler: (event: ProjectEventPayload) => void | Promise<void>,
    options?: {
      cardId?: string;
      commentId?: string;
    },
  ): string {
    return this.subscribeToResource(projectId, 'comment', (event) => {
      // Additional filtering for card-specific comments
      if (options?.cardId && event.data?.cardId !== options.cardId) {
        return;
      }

      if (options?.commentId && event.resourceId !== options.commentId) {
        return;
      }

      return handler(event);
    });
  }

  // Unsubscribe from events
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
      this.logger.log(`Removed subscription ${subscriptionId}`);
      return true;
    }
    return false;
  }

  // Publish project events
  async publishProjectEvent(event: ProjectEventPayload): Promise<void> {
    const channel = `project:${event.projectId}`;
    await this.pubSub.publish(channel as any, event);

    this.logger.debug(
      `Published ${event.resource}_${event.type} event to ${channel}`,
    );
  }

  // Publish card-specific events
  async publishCardEvent(
    projectId: string,
    cardId: string,
    eventType: 'create' | 'update' | 'delete' | 'move',
    data: any,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: eventType,
      resource: 'card',
      resourceId: cardId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    await this.publishProjectEvent(event);
  }

  // Publish board-specific events
  async publishBoardEvent(
    projectId: string,
    boardId: string,
    eventType: 'create' | 'update' | 'delete',
    data: any,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: eventType,
      resource: 'board',
      resourceId: boardId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    await this.publishProjectEvent(event);
  }

  // Publish comment-specific events
  async publishCommentEvent(
    projectId: string,
    commentId: string,
    eventType: 'create' | 'update' | 'delete',
    data: any,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: eventType,
      resource: 'comment',
      resourceId: commentId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    await this.publishProjectEvent(event);
  }

  // Publish member-specific events
  async publishMemberEvent(
    projectId: string,
    memberId: string,
    eventType: 'create' | 'update' | 'delete',
    data: any,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: ProjectEventPayload = {
      type: eventType,
      resource: 'member',
      resourceId: memberId,
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    await this.publishProjectEvent(event);
  }

  // Batch publish multiple events
  async publishBatch(events: ProjectEventPayload[]): Promise<void> {
    const publishPromises = events.map((event) =>
      this.publishProjectEvent(event),
    );
    await Promise.all(publishPromises);

    this.logger.debug(`Published batch of ${events.length} project events`);
  }

  // Get subscription statistics
  getSubscriptionStats(): {
    totalSubscriptions: number;
    subscriptionsByProject: Record<string, number>;
    subscriptionsByResource: Record<string, number>;
    oldestSubscription: Date | null;
  } {
    const subscriptions = Array.from(this.subscriptions.values());

    const subscriptionsByProject: Record<string, number> = {};
    const subscriptionsByResource: Record<string, number> = {};
    let oldestSubscription: Date | null = null;

    for (const sub of subscriptions) {
      // Count by project
      subscriptionsByProject[sub.projectId] =
        (subscriptionsByProject[sub.projectId] || 0) + 1;

      // Count by resource type
      const resourceType = sub.filter?.resourceType || 'all';
      subscriptionsByResource[resourceType] =
        (subscriptionsByResource[resourceType] || 0) + 1;

      // Track oldest subscription
      if (!oldestSubscription || sub.createdAt < oldestSubscription) {
        oldestSubscription = sub.createdAt;
      }
    }

    return {
      totalSubscriptions: subscriptions.length,
      subscriptionsByProject,
      subscriptionsByResource,
      oldestSubscription,
    };
  }

  // Cleanup old subscriptions (useful for preventing memory leaks)
  cleanupOldSubscriptions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = new Date(Date.now() - maxAgeMs);
    let cleaned = 0;

    for (const [id, subscription] of this.subscriptions.entries()) {
      if (subscription.createdAt < cutoffTime) {
        this.subscriptions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old project subscriptions`);
    }

    return cleaned;
  }

  // Test method for development/debugging
  async testProjectEvent(
    projectId: string,
    eventType: string = 'test',
  ): Promise<void> {
    const testEvent: ProjectEventPayload = {
      type: 'update',
      resource: 'project',
      resourceId: projectId,
      projectId,
      userId: 'system',
      timestamp: new Date().toISOString(),
      data: { test: true, eventType },
      metadata: { source: 'test' },
    };

    await this.publishProjectEvent(testEvent);
    this.logger.log(`Published test event for project ${projectId}`);
  }
}
