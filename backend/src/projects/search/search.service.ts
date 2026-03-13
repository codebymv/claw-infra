import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Card, CardStatus, CardPriority, CardType } from '../../database/entities/card.entity';
import { Comment } from '../../database/entities/comment.entity';
import { Project } from '../../database/entities/project.entity';
import { KanbanBoard } from '../../database/entities/kanban-board.entity';
import { Column } from '../../database/entities/column.entity';
import { User } from '../../database/entities/user.entity';

export interface SearchQuery {
  query: string;
  projectId?: string;
  boardId?: string;
  columnId?: string;
  assigneeId?: string;
  reporterId?: string;
  status?: CardStatus[];
  priority?: CardPriority[];
  type?: CardType[];
  tags?: string[];
  dueBefore?: Date;
  dueAfter?: Date;
  createdBefore?: Date;
  createdAfter?: Date;
  updatedBefore?: Date;
  updatedAfter?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'created' | 'updated' | 'due' | 'priority';
  sortOrder?: 'ASC' | 'DESC';
}

export interface SearchResult<T = any> {
  item: T;
  type: 'card' | 'comment' | 'project' | 'board';
  relevance: number;
  highlights: string[];
  context?: Record<string, any>;
}

export interface SearchResponse<T = any> {
  results: SearchResult<T>[];
  total: number;
  query: string;
  executionTime: number;
  facets: {
    types: Record<string, number>;
    statuses: Record<string, number>;
    priorities: Record<string, number>;
    assignees: Record<string, number>;
    tags: Record<string, number>;
  };
  suggestions: string[];
}

export interface AutocompleteQuery {
  query: string;
  projectId?: string;
  type?: 'all' | 'cards' | 'users' | 'tags';
  limit?: number;
}

export interface AutocompleteResult {
  text: string;
  type: 'card' | 'user' | 'tag' | 'project';
  id?: string;
  context?: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Card) private readonly cardRepo: Repository<Card>,
    @InjectRepository(Comment) private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(KanbanBoard) private readonly boardRepo: Repository<KanbanBoard>,
    @InjectRepository(Column) private readonly columnRepo: Repository<Column>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async searchCards(searchQuery: SearchQuery): Promise<SearchResponse<Card>> {
    const startTime = Date.now();
    const { query, limit = 50, offset = 0, sortBy = 'relevance', sortOrder = 'DESC' } = searchQuery;

    // Build the base query with full-text search
    let queryBuilder = this.cardRepo
      .createQueryBuilder('card')
      .leftJoinAndSelect('card.assignee', 'assignee')
      .leftJoinAndSelect('card.reporter', 'reporter')
      .leftJoinAndSelect('card.column', 'column')
      .leftJoinAndSelect('card.board', 'board')
      .leftJoinAndSelect('board.project', 'project');

    // Add full-text search if query is provided
    if (query && query.trim()) {
      const searchTerms = this.preprocessSearchQuery(query);
      
      // Use PostgreSQL full-text search with ranking
      queryBuilder = queryBuilder
        .addSelect(
          `ts_rank_cd(
            to_tsvector('english', 
              coalesce(card.title, '') || ' ' || 
              coalesce(card.description, '') || ' ' || 
              array_to_string(card.tags, ' ')
            ), 
            plainto_tsquery('english', :searchTerms)
          )`,
          'relevance'
        )
        .where(
          `to_tsvector('english', 
            coalesce(card.title, '') || ' ' || 
            coalesce(card.description, '') || ' ' || 
            array_to_string(card.tags, ' ')
          ) @@ plainto_tsquery('english', :searchTerms)`,
          { searchTerms }
        );
    }

    // Apply filters
    queryBuilder = this.applyCardFilters(queryBuilder, searchQuery);

    // Apply sorting
    queryBuilder = this.applyCardSorting(queryBuilder, sortBy, sortOrder, !!query);

    // Get total count for pagination
    const totalQuery = queryBuilder.clone();
    const total = await totalQuery.getCount();

    // Apply pagination
    queryBuilder = queryBuilder.skip(offset).take(limit);

    // Execute query
    const results = await queryBuilder.getRawAndEntities();
    const cards = results.entities;
    const rawResults = results.raw;

    // Build search results with highlights and relevance
    const searchResults: SearchResult<Card>[] = cards.map((card, index) => {
      const relevance = query ? (rawResults[index]?.relevance || 0) : 1;
      const highlights = query ? this.generateHighlights(card, query) : [];

      return {
        item: card,
        type: 'card' as const,
        relevance: parseFloat(relevance.toString()),
        highlights,
        context: {
          projectName: card.board?.project?.name,
          boardName: card.board?.name,
          columnName: card.column?.name,
        },
      };
    });

    // Generate facets
    const facets = await this.generateCardFacets(searchQuery);

    // Generate suggestions
    const suggestions = query ? await this.generateSearchSuggestions(query, searchQuery.projectId) : [];

    const executionTime = Date.now() - startTime;

    return {
      results: searchResults,
      total,
      query: query || '',
      executionTime,
      facets,
      suggestions,
    };
  }

  async searchComments(searchQuery: SearchQuery): Promise<SearchResponse<Comment>> {
    const startTime = Date.now();
    const { query, limit = 50, offset = 0, sortBy = 'relevance', sortOrder = 'DESC' } = searchQuery;

    let queryBuilder = this.commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.card', 'card')
      .leftJoinAndSelect('card.board', 'board')
      .leftJoinAndSelect('board.project', 'project')
      .where('comment.deleted_at IS NULL');

    // Add full-text search
    if (query && query.trim()) {
      const searchTerms = this.preprocessSearchQuery(query);
      
      queryBuilder = queryBuilder
        .addSelect(
          `ts_rank_cd(
            to_tsvector('english', coalesce(comment.content, '')), 
            plainto_tsquery('english', :searchTerms)
          )`,
          'relevance'
        )
        .andWhere(
          `to_tsvector('english', coalesce(comment.content, '')) @@ plainto_tsquery('english', :searchTerms)`,
          { searchTerms }
        );
    }

    // Apply project filter
    if (searchQuery.projectId) {
      queryBuilder = queryBuilder.andWhere('project.id = :projectId', { projectId: searchQuery.projectId });
    }

    // Apply board filter
    if (searchQuery.boardId) {
      queryBuilder = queryBuilder.andWhere('board.id = :boardId', { boardId: searchQuery.boardId });
    }

    // Apply date filters
    if (searchQuery.createdAfter) {
      queryBuilder = queryBuilder.andWhere('comment.created_at >= :createdAfter', { createdAfter: searchQuery.createdAfter });
    }
    if (searchQuery.createdBefore) {
      queryBuilder = queryBuilder.andWhere('comment.created_at <= :createdBefore', { createdBefore: searchQuery.createdBefore });
    }

    // Apply sorting
    if (query && sortBy === 'relevance') {
      queryBuilder = queryBuilder.orderBy('relevance', sortOrder);
    } else {
      const sortField = sortBy === 'created' ? 'comment.created_at' : 'comment.updated_at';
      queryBuilder = queryBuilder.orderBy(sortField, sortOrder);
    }

    const total = await queryBuilder.getCount();
    queryBuilder = queryBuilder.skip(offset).take(limit);

    const results = await queryBuilder.getRawAndEntities();
    const comments = results.entities;
    const rawResults = results.raw;

    const searchResults: SearchResult<Comment>[] = comments.map((comment, index) => {
      const relevance = query ? (rawResults[index]?.relevance || 0) : 1;
      const highlights = query ? this.generateCommentHighlights(comment, query) : [];

      return {
        item: comment,
        type: 'comment' as const,
        relevance: parseFloat(relevance.toString()),
        highlights,
        context: {
          projectName: comment.card?.board?.project?.name,
          boardName: comment.card?.board?.name,
          cardTitle: comment.card?.title,
        },
      };
    });

    const executionTime = Date.now() - startTime;

    return {
      results: searchResults,
      total,
      query: query || '',
      executionTime,
      facets: {
        types: {},
        statuses: {},
        priorities: {},
        assignees: {},
        tags: {},
      },
      suggestions: [],
    };
  }

  async searchAll(searchQuery: SearchQuery): Promise<SearchResponse> {
    const [cardResults, commentResults] = await Promise.all([
      this.searchCards(searchQuery),
      this.searchComments(searchQuery),
    ]);

    // Combine and sort results by relevance
    const allResults = [
      ...cardResults.results,
      ...commentResults.results,
    ].sort((a, b) => b.relevance - a.relevance);

    // Apply pagination to combined results
    const { limit = 50, offset = 0 } = searchQuery;
    const paginatedResults = allResults.slice(offset, offset + limit);

    return {
      results: paginatedResults,
      total: cardResults.total + commentResults.total,
      query: searchQuery.query || '',
      executionTime: Math.max(cardResults.executionTime, commentResults.executionTime),
      facets: cardResults.facets, // Use card facets as primary
      suggestions: cardResults.suggestions,
    };
  }

  async autocomplete(autocompleteQuery: AutocompleteQuery): Promise<AutocompleteResult[]> {
    const { query, projectId, type = 'all', limit = 10 } = autocompleteQuery;
    const results: AutocompleteResult[] = [];

    if (!query || query.length < 2) {
      return results;
    }

    const searchTerm = `%${query.toLowerCase()}%`;

    // Search cards
    if (type === 'all' || type === 'cards') {
      let cardQuery = this.cardRepo
        .createQueryBuilder('card')
        .leftJoinAndSelect('card.board', 'board')
        .leftJoinAndSelect('board.project', 'project')
        .where('LOWER(card.title) LIKE :searchTerm', { searchTerm })
        .take(limit);

      if (projectId) {
        cardQuery = cardQuery.andWhere('project.id = :projectId', { projectId });
      }

      const cards = await cardQuery.getMany();
      results.push(...cards.map(card => ({
        text: card.title,
        type: 'card' as const,
        id: card.id,
        context: `${card.board?.project?.name} > ${card.board?.name}`,
      })));
    }

    // Search users
    if (type === 'all' || type === 'users') {
      const users = await this.userRepo
        .createQueryBuilder('user')
        .where('LOWER(user.email) LIKE :searchTerm OR LOWER(user.display_name) LIKE :searchTerm', { searchTerm })
        .take(limit)
        .getMany();

      results.push(...users.map(user => ({
        text: user.email,
        type: 'user' as const,
        id: user.id,
        context: user.displayName || user.email,
      })));
    }

    // Search tags
    if (type === 'all' || type === 'tags') {
      let tagQuery = this.cardRepo
        .createQueryBuilder('card')
        .select('DISTINCT unnest(card.tags)', 'tag')
        .where('EXISTS (SELECT 1 FROM unnest(card.tags) AS tag WHERE LOWER(tag) LIKE :searchTerm)', { searchTerm })
        .take(limit);

      if (projectId) {
        tagQuery = tagQuery
          .leftJoin('card.board', 'board')
          .leftJoin('board.project', 'project')
          .andWhere('project.id = :projectId', { projectId });
      }

      const tagResults = await tagQuery.getRawMany();
      results.push(...tagResults.map(result => ({
        text: result.tag,
        type: 'tag' as const,
      })));
    }

    // Sort by relevance (exact matches first, then partial matches)
    return results
      .sort((a, b) => {
        const aExact = a.text.toLowerCase() === query.toLowerCase() ? 1 : 0;
        const bExact = b.text.toLowerCase() === query.toLowerCase() ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        
        const aStarts = a.text.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0;
        const bStarts = b.text.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0;
        return bStarts - aStarts;
      })
      .slice(0, limit);
  }

  private applyCardFilters(
    queryBuilder: SelectQueryBuilder<Card>,
    searchQuery: SearchQuery
  ): SelectQueryBuilder<Card> {
    const {
      projectId,
      boardId,
      columnId,
      assigneeId,
      reporterId,
      status,
      priority,
      type,
      tags,
      dueBefore,
      dueAfter,
      createdBefore,
      createdAfter,
      updatedBefore,
      updatedAfter,
    } = searchQuery;

    if (projectId) {
      queryBuilder = queryBuilder.andWhere('project.id = :projectId', { projectId });
    }

    if (boardId) {
      queryBuilder = queryBuilder.andWhere('board.id = :boardId', { boardId });
    }

    if (columnId) {
      queryBuilder = queryBuilder.andWhere('card.column_id = :columnId', { columnId });
    }

    if (assigneeId) {
      queryBuilder = queryBuilder.andWhere('card.assignee_id = :assigneeId', { assigneeId });
    }

    if (reporterId) {
      queryBuilder = queryBuilder.andWhere('card.reporter_id = :reporterId', { reporterId });
    }

    if (status && status.length > 0) {
      queryBuilder = queryBuilder.andWhere('card.status IN (:...status)', { status });
    }

    if (priority && priority.length > 0) {
      queryBuilder = queryBuilder.andWhere('card.priority IN (:...priority)', { priority });
    }

    if (type && type.length > 0) {
      queryBuilder = queryBuilder.andWhere('card.type IN (:...type)', { type });
    }

    if (tags && tags.length > 0) {
      queryBuilder = queryBuilder.andWhere('card.tags && :tags', { tags });
    }

    if (dueBefore) {
      queryBuilder = queryBuilder.andWhere('card.due_date <= :dueBefore', { dueBefore });
    }

    if (dueAfter) {
      queryBuilder = queryBuilder.andWhere('card.due_date >= :dueAfter', { dueAfter });
    }

    if (createdBefore) {
      queryBuilder = queryBuilder.andWhere('card.created_at <= :createdBefore', { createdBefore });
    }

    if (createdAfter) {
      queryBuilder = queryBuilder.andWhere('card.created_at >= :createdAfter', { createdAfter });
    }

    if (updatedBefore) {
      queryBuilder = queryBuilder.andWhere('card.updated_at <= :updatedBefore', { updatedBefore });
    }

    if (updatedAfter) {
      queryBuilder = queryBuilder.andWhere('card.updated_at >= :updatedAfter', { updatedAfter });
    }

    return queryBuilder;
  }

  private applyCardSorting(
    queryBuilder: SelectQueryBuilder<Card>,
    sortBy: string,
    sortOrder: 'ASC' | 'DESC',
    hasQuery: boolean
  ): SelectQueryBuilder<Card> {
    if (hasQuery && sortBy === 'relevance') {
      queryBuilder = queryBuilder.orderBy('relevance', sortOrder);
    } else {
      switch (sortBy) {
        case 'created':
          queryBuilder = queryBuilder.orderBy('card.created_at', sortOrder);
          break;
        case 'updated':
          queryBuilder = queryBuilder.orderBy('card.updated_at', sortOrder);
          break;
        case 'due':
          queryBuilder = queryBuilder.orderBy('card.due_date', sortOrder, 'NULLS LAST');
          break;
        case 'priority':
          queryBuilder = queryBuilder.orderBy(
            `CASE card.priority 
              WHEN 'urgent' THEN 4 
              WHEN 'high' THEN 3 
              WHEN 'medium' THEN 2 
              WHEN 'low' THEN 1 
              ELSE 0 END`,
            sortOrder
          );
          break;
        default:
          queryBuilder = queryBuilder.orderBy('card.updated_at', 'DESC');
      }
    }

    return queryBuilder;
  }

  private async generateCardFacets(searchQuery: SearchQuery): Promise<SearchResponse['facets']> {
    const baseQuery = this.cardRepo.createQueryBuilder('card')
      .leftJoin('card.board', 'board')
      .leftJoin('board.project', 'project')
      .leftJoin('card.assignee', 'assignee');

    // Apply same filters as main search (except the ones we're faceting on)
    if (searchQuery.projectId) {
      baseQuery.andWhere('project.id = :projectId', { projectId: searchQuery.projectId });
    }

    const [types, statuses, priorities, assignees, tags] = await Promise.all([
      // Types facet
      baseQuery.clone()
        .select('card.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('card.type')
        .getRawMany(),
      
      // Statuses facet
      baseQuery.clone()
        .select('card.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('card.status')
        .getRawMany(),
      
      // Priorities facet
      baseQuery.clone()
        .select('card.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .groupBy('card.priority')
        .getRawMany(),
      
      // Assignees facet
      baseQuery.clone()
        .select('assignee.username', 'username')
        .addSelect('COUNT(*)', 'count')
        .where('assignee.username IS NOT NULL')
        .groupBy('assignee.username')
        .getRawMany(),
      
      // Tags facet
      baseQuery.clone()
        .select('unnest(card.tags)', 'tag')
        .addSelect('COUNT(*)', 'count')
        .where('array_length(card.tags, 1) > 0')
        .groupBy('tag')
        .getRawMany(),
    ]);

    return {
      types: types.reduce((acc, item) => ({ ...acc, [item.type]: parseInt(item.count) }), {}),
      statuses: statuses.reduce((acc, item) => ({ ...acc, [item.status]: parseInt(item.count) }), {}),
      priorities: priorities.reduce((acc, item) => ({ ...acc, [item.priority]: parseInt(item.count) }), {}),
      assignees: assignees.reduce((acc, item) => ({ ...acc, [item.username]: parseInt(item.count) }), {}),
      tags: tags.reduce((acc, item) => ({ ...acc, [item.tag]: parseInt(item.count) }), {}),
    };
  }

  private async generateSearchSuggestions(query: string, projectId?: string): Promise<string[]> {
    // Simple suggestion generation based on common search patterns
    const suggestions: string[] = [];
    
    // Add status-based suggestions
    const statuses = ['open', 'in_progress', 'completed', 'blocked'];
    const matchingStatuses = statuses.filter(status => 
      status.toLowerCase().includes(query.toLowerCase())
    );
    suggestions.push(...matchingStatuses.map(status => `status:${status}`));

    // Add priority-based suggestions
    const priorities = ['urgent', 'high', 'medium', 'low'];
    const matchingPriorities = priorities.filter(priority => 
      priority.toLowerCase().includes(query.toLowerCase())
    );
    suggestions.push(...matchingPriorities.map(priority => `priority:${priority}`));

    return suggestions.slice(0, 5);
  }

  private generateHighlights(card: Card, query: string): string[] {
    const highlights: string[] = [];
    const searchTerms = query.toLowerCase().split(/\s+/);

    // Check title
    if (card.title && searchTerms.some(term => card.title.toLowerCase().includes(term))) {
      highlights.push(this.highlightText(card.title, searchTerms));
    }

    // Check description
    if (card.description && searchTerms.some(term => card.description!.toLowerCase().includes(term))) {
      const snippet = this.extractSnippet(card.description, searchTerms);
      highlights.push(this.highlightText(snippet, searchTerms));
    }

    // Check tags
    const matchingTags = card.tags?.filter(tag => 
      searchTerms.some(term => tag.toLowerCase().includes(term))
    ) || [];
    if (matchingTags.length > 0) {
      highlights.push(`Tags: ${matchingTags.join(', ')}`);
    }

    return highlights;
  }

  private generateCommentHighlights(comment: Comment, query: string): string[] {
    const highlights: string[] = [];
    const searchTerms = query.toLowerCase().split(/\s+/);

    if (comment.content && searchTerms.some(term => comment.content.toLowerCase().includes(term))) {
      const snippet = this.extractSnippet(comment.content, searchTerms);
      highlights.push(this.highlightText(snippet, searchTerms));
    }

    return highlights;
  }

  private extractSnippet(text: string, searchTerms: string[], maxLength: number = 200): string {
    const lowerText = text.toLowerCase();
    let bestStart = 0;
    let bestScore = 0;

    // Find the position with the most search terms
    for (let i = 0; i < text.length - maxLength; i += 20) {
      const snippet = lowerText.substring(i, i + maxLength);
      const score = searchTerms.reduce((acc, term) => {
        const matches = (snippet.match(new RegExp(term, 'g')) || []).length;
        return acc + matches;
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }

    let snippet = text.substring(bestStart, bestStart + maxLength);
    if (bestStart > 0) snippet = '...' + snippet;
    if (bestStart + maxLength < text.length) snippet = snippet + '...';

    return snippet;
  }

  private highlightText(text: string, searchTerms: string[]): string {
    let highlighted = text;
    
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    });

    return highlighted;
  }

  private preprocessSearchQuery(query: string): string {
    // Remove special characters and normalize whitespace
    return query
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}