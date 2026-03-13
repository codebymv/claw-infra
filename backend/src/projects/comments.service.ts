import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Comment } from '../database/entities/comment.entity';
import { Card } from '../database/entities/card.entity';
import { User } from '../database/entities/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import { ProjectWebSocketGateway } from './ws/project-websocket.gateway';
import { ProjectPubSubService } from './ws/project-pubsub.service';
import * as DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectRepository(Comment) private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Card) private readonly cardRepo: Repository<Card>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly gateway: ProjectWebSocketGateway,
    private readonly pubSub: ProjectPubSubService,
  ) {
    // Configure marked for safe markdown processing
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  async createComment(cardId: string, dto: CreateCommentDto, authorId: string): Promise<Comment> {
    // Validate card exists
    const card = await this.cardRepo.findOne({
      where: { id: cardId },
      relations: ['board'],
    });

    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    // Validate parent comment if provided
    if (dto.parentId) {
      const parentComment = await this.commentRepo.findOne({
        where: { id: dto.parentId, cardId },
      });

      if (!parentComment) {
        throw new NotFoundException(`Parent comment ${dto.parentId} not found`);
      }

      // Prevent deeply nested replies (max 2 levels)
      if (parentComment.parentId) {
        throw new BadRequestException('Cannot reply to a reply. Maximum nesting level is 2.');
      }
    }

    // Process markdown and extract mentions
    const { contentHtml, mentions } = await this.processMarkdown(dto.content);

    const comment = this.commentRepo.create({
      cardId,
      authorId,
      content: dto.content,
      contentHtml,
      mentions,
      parentId: dto.parentId || null,
    });

    const saved = await this.commentRepo.save(comment);
    const result = await this.getCommentById(saved.id);

    // Send notifications for mentions
    if (mentions.length > 0) {
      await this.sendMentionNotifications(result, mentions);
    }

    // Broadcast comment creation
    await this.pubSub.publishCommentEvent(
      card.board.projectId,
      saved.id,
      'create',
      result,
      authorId
    );

    this.logger.log(`Created comment ${saved.id} on card ${cardId} by user ${authorId}`);
    return result;
  }

  async getCommentById(id: string): Promise<Comment> {
    const comment = await this.commentRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['author', 'card', 'parent', 'replies', 'replies.author'],
      order: {
        replies: { createdAt: 'ASC' },
      },
    });

    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }

    return comment;
  }

  async listComments(cardId: string, query: ListCommentsQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build base query
    const queryBuilder = this.commentRepo.createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.replies', 'replies')
      .leftJoinAndSelect('replies.author', 'replyAuthor')
      .where('comment.card_id = :cardId', { cardId })
      .andWhere('comment.deleted_at IS NULL')
      .orderBy('comment.created_at', 'DESC')
      .addOrderBy('replies.created_at', 'ASC')
      .skip(skip)
      .take(limit);

    // Filter by parent (for threading)
    if (query.parentId) {
      queryBuilder.andWhere('comment.parent_id = :parentId', { parentId: query.parentId });
    } else {
      // Only get top-level comments (no parent)
      queryBuilder.andWhere('comment.parent_id IS NULL');
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

  async updateComment(id: string, dto: UpdateCommentDto, userId: string): Promise<Comment> {
    const comment = await this.getCommentById(id);

    // Check permissions - only author can edit
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Only the comment author can edit this comment');
    }

    // Process updated markdown and extract mentions
    const { contentHtml, mentions } = await this.processMarkdown(dto.content);

    await this.commentRepo.update(id, {
      content: dto.content,
      contentHtml,
      mentions,
      isEdited: true,
    });

    const updated = await this.getCommentById(id);

    // Send notifications for new mentions
    const newMentions = mentions.filter(mention => !comment.mentions.includes(mention));
    if (newMentions.length > 0) {
      await this.sendMentionNotifications(updated, newMentions);
    }

    // Broadcast comment update
    await this.pubSub.publishCommentEvent(
      comment.card.board.projectId,
      id,
      'update',
      updated,
      userId
    );

    this.logger.log(`Updated comment ${id} by user ${userId}`);
    return updated;
  }

  async deleteComment(id: string, userId: string): Promise<void> {
    const comment = await this.getCommentById(id);

    // Check permissions - only author can delete
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Only the comment author can delete this comment');
    }

    // Soft delete
    await this.commentRepo.update(id, {
      deletedAt: new Date(),
      content: '[deleted]',
      contentHtml: '<p><em>[deleted]</em></p>',
      mentions: [],
    });

    // Broadcast comment deletion
    await this.pubSub.publishCommentEvent(
      comment.card.board.projectId,
      id,
      'delete',
      { cardId: comment.cardId },
      userId
    );

    this.logger.log(`Deleted comment ${id} by user ${userId}`);
  }

  async getCommentThread(commentId: string): Promise<Comment> {
    // Get the root comment and all its replies
    const comment = await this.commentRepo.findOne({
      where: { id: commentId, deletedAt: IsNull() },
      relations: ['author', 'card', 'replies', 'replies.author', 'replies.replies'],
      order: {
        replies: { createdAt: 'ASC' },
      },
    });

    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    // If this is a reply, get the parent thread instead
    if (comment.parentId) {
      return this.getCommentThread(comment.parentId);
    }

    return comment;
  }

  // Private helper methods
  private async processMarkdown(content: string): Promise<{ contentHtml: string; mentions: string[] }> {
    // Extract mentions before processing markdown
    const mentions = this.extractMentions(content);

    // Convert markdown to HTML
    let contentHtml = await marked(content);

    // Sanitize HTML to prevent XSS
    contentHtml = DOMPurify.sanitize(contentHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    // Process mentions to add proper links/styling
    contentHtml = await this.processMentions(contentHtml, mentions);

    return { contentHtml, mentions };
  }

  private extractMentions(content: string): string[] {
    // Extract @username mentions
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1];
      if (!mentions.includes(username)) {
        mentions.push(username);
      }
    }

    return mentions;
  }

  private async processMentions(html: string, mentions: string[]): Promise<string> {
    let processedHtml = html;

    for (const mention of mentions) {
      // Try to find user by email or display name
      const user = await this.userRepo
        .createQueryBuilder('user')
        .where('user.email ILIKE :mention', { mention: `%${mention}%` })
        .orWhere('user.display_name ILIKE :mention', { mention: `%${mention}%` })
        .getOne();

      if (user) {
        // Replace @username with a styled mention
        const mentionRegex = new RegExp(`@${mention}\\b`, 'g');
        processedHtml = processedHtml.replace(
          mentionRegex,
          `<span class="mention" data-user-id="${user.id}">@${mention}</span>`
        );
      }
    }

    return processedHtml;
  }

  private async sendMentionNotifications(comment: Comment, mentions: string[]): Promise<void> {
    // Get mentioned users by email or display name
    const mentionedUsers: User[] = [];
    
    for (const mention of mentions) {
      const user = await this.userRepo
        .createQueryBuilder('user')
        .where('user.email ILIKE :mention', { mention: `%${mention}%` })
        .orWhere('user.display_name ILIKE :mention', { mention: `%${mention}%` })
        .getOne();
      
      if (user && !mentionedUsers.find(u => u.id === user.id)) {
        mentionedUsers.push(user);
      }
    }

    for (const user of mentionedUsers) {
      // Skip self-mentions
      if (user.id === comment.authorId) continue;

      // Send notification (this would integrate with a notification service)
      this.logger.log(`Sending mention notification to user ${user.id} for comment ${comment.id}`);
      
      // Broadcast mention notification
      await this.pubSub.publishProjectEvent({
        type: 'create',
        resource: 'comment',
        resourceId: comment.id,
        projectId: comment.card.board.projectId,
        userId: comment.authorId,
        timestamp: new Date().toISOString(),
        data: {
          type: 'mention',
          mentionedUserId: user.id,
          comment,
          author: comment.author,
        },
        metadata: { mention: true },
      });
    }
  }

  async getCommentsByCard(cardId: string): Promise<Comment[]> {
    return this.commentRepo.find({
      where: { cardId, deletedAt: IsNull() },
      relations: ['author', 'replies', 'replies.author'],
      order: {
        createdAt: 'ASC',
        replies: { createdAt: 'ASC' },
      },
    });
  }

  async getCommentStats(cardId: string): Promise<{ total: number; authors: number }> {
    const [total, authors] = await Promise.all([
      this.commentRepo.count({
        where: { cardId, deletedAt: IsNull() },
      }),
      this.commentRepo
        .createQueryBuilder('comment')
        .select('COUNT(DISTINCT comment.author_id)', 'count')
        .where('comment.card_id = :cardId', { cardId })
        .andWhere('comment.deleted_at IS NULL')
        .getRawOne<{ count: string }>(),
    ]);

    return {
      total,
      authors: parseInt(authors?.count || '0', 10),
    };
  }
}