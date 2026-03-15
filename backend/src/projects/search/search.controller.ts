import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import {
  SearchService,
  SearchQuery,
  AutocompleteQuery,
} from './search.service';
import { ProjectAuthGuard } from '../auth/project-auth.guard';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { AuditLogService } from '../auth/audit-log.service';
import {
  CardStatus,
  CardPriority,
  CardType,
} from '../../database/entities/card.entity';

export class SearchQueryDto {
  q?: string; // search query
  projectId?: string;
  boardId?: string;
  columnId?: string;
  assigneeId?: string;
  reporterId?: string;
  status?: string; // comma-separated values
  priority?: string; // comma-separated values
  type?: string; // comma-separated values
  tags?: string; // comma-separated values
  due_before?: string; // ISO date string
  due_after?: string; // ISO date string
  created_before?: string; // ISO date string
  created_after?: string; // ISO date string
  updated_before?: string; // ISO date string
  updated_after?: string; // ISO date string
  limit?: string;
  offset?: string;
  sort_by?: 'relevance' | 'created' | 'updated' | 'due' | 'priority';
  sort_order?: 'ASC' | 'DESC';
}

export class AutocompleteQueryDto {
  q: string;
  type?: 'all' | 'cards' | 'users' | 'tags';
  limit?: string;
}

@Controller('projects/:projectId/search')
@UseGuards(ProjectAuthGuard, ProjectAccessGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('cards')
  async searchCards(
    @Param('projectId') projectId: string,
    @Query() queryDto: SearchQueryDto,
    @Request() req,
  ) {
    const searchQuery = this.buildSearchQuery(queryDto, projectId);

    const result = await this.searchService.searchCards(searchQuery);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'search.cards',
      resource: 'search',
      resourceId: 'cards',
      projectId,
      metadata: {
        query: searchQuery.query,
        resultsCount: result.total,
        executionTime: result.executionTime,
      },
    });

    return result;
  }

  @Get('comments')
  async searchComments(
    @Param('projectId') projectId: string,
    @Query() queryDto: SearchQueryDto,
    @Request() req,
  ) {
    const searchQuery = this.buildSearchQuery(queryDto, projectId);

    const result = await this.searchService.searchComments(searchQuery);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'search.comments',
      resource: 'search',
      resourceId: 'comments',
      projectId,
      metadata: {
        query: searchQuery.query,
        resultsCount: result.total,
        executionTime: result.executionTime,
      },
    });

    return result;
  }

  @Get('all')
  async searchAll(
    @Param('projectId') projectId: string,
    @Query() queryDto: SearchQueryDto,
    @Request() req,
  ) {
    const searchQuery = this.buildSearchQuery(queryDto, projectId);

    const result = await this.searchService.searchAll(searchQuery);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'search.all',
      resource: 'search',
      resourceId: 'all',
      projectId,
      metadata: {
        query: searchQuery.query,
        resultsCount: result.total,
        executionTime: result.executionTime,
      },
    });

    return result;
  }

  @Get('autocomplete')
  async autocomplete(
    @Param('projectId') projectId: string,
    @Query() queryDto: AutocompleteQueryDto,
    @Request() req,
  ) {
    if (!queryDto.q || queryDto.q.length < 2) {
      throw new BadRequestException('Query must be at least 2 characters long');
    }

    const autocompleteQuery: AutocompleteQuery = {
      query: queryDto.q,
      projectId,
      type: queryDto.type || 'all',
      limit: queryDto.limit ? parseInt(queryDto.limit) : 10,
    };

    const result = await this.searchService.autocomplete(autocompleteQuery);

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'search.autocomplete',
      resource: 'search',
      resourceId: 'autocomplete',
      projectId,
      metadata: {
        query: autocompleteQuery.query,
        type: autocompleteQuery.type,
        resultsCount: result.length,
      },
    });

    return {
      query: autocompleteQuery.query,
      results: result,
    };
  }

  @Get('suggestions')
  async getSearchSuggestions(
    @Param('projectId') projectId: string,
    @Query('q') query: string,
    @Request() req,
  ) {
    if (!query || query.length < 2) {
      return { suggestions: [] };
    }

    // Generate search suggestions based on query patterns
    const suggestions = await this.generateAdvancedSuggestions(
      query,
      projectId,
    );

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'search.suggestions',
      resource: 'search',
      resourceId: 'suggestions',
      projectId,
      metadata: { query, suggestionsCount: suggestions.length },
    });

    return { suggestions };
  }

  @Get('facets')
  async getSearchFacets(
    @Param('projectId') projectId: string,
    @Query() queryDto: SearchQueryDto,
    @Request() req,
  ) {
    const searchQuery = this.buildSearchQuery(queryDto, projectId);

    // Get facets by running a search with no results (limit 0)
    const result = await this.searchService.searchCards({
      ...searchQuery,
      limit: 0,
    });

    await this.auditLogService.logAccess({
      userId: req.user.id,
      action: 'search.facets',
      resource: 'search',
      resourceId: 'facets',
      projectId,
      metadata: { query: searchQuery.query },
    });

    return {
      facets: result.facets,
      query: searchQuery.query,
    };
  }

  private buildSearchQuery(
    queryDto: SearchQueryDto,
    projectId: string,
  ): SearchQuery {
    const searchQuery: SearchQuery = {
      query: queryDto.q || '',
      projectId,
      limit: queryDto.limit ? parseInt(queryDto.limit) : 50,
      offset: queryDto.offset ? parseInt(queryDto.offset) : 0,
      sortBy: queryDto.sort_by || 'relevance',
      sortOrder: queryDto.sort_order || 'DESC',
    };

    // Parse optional filters
    if (queryDto.boardId) {
      searchQuery.boardId = queryDto.boardId;
    }

    if (queryDto.columnId) {
      searchQuery.columnId = queryDto.columnId;
    }

    if (queryDto.assigneeId) {
      searchQuery.assigneeId = queryDto.assigneeId;
    }

    if (queryDto.reporterId) {
      searchQuery.reporterId = queryDto.reporterId;
    }

    // Parse array filters
    if (queryDto.status) {
      searchQuery.status = queryDto.status
        .split(',')
        .map((s) => s.trim() as CardStatus);
    }

    if (queryDto.priority) {
      searchQuery.priority = queryDto.priority
        .split(',')
        .map((p) => p.trim() as CardPriority);
    }

    if (queryDto.type) {
      searchQuery.type = queryDto.type
        .split(',')
        .map((t) => t.trim() as CardType);
    }

    if (queryDto.tags) {
      searchQuery.tags = queryDto.tags.split(',').map((t) => t.trim());
    }

    // Parse date filters
    if (queryDto.due_before) {
      searchQuery.dueBefore = new Date(queryDto.due_before);
    }

    if (queryDto.due_after) {
      searchQuery.dueAfter = new Date(queryDto.due_after);
    }

    if (queryDto.created_before) {
      searchQuery.createdBefore = new Date(queryDto.created_before);
    }

    if (queryDto.created_after) {
      searchQuery.createdAfter = new Date(queryDto.created_after);
    }

    if (queryDto.updated_before) {
      searchQuery.updatedBefore = new Date(queryDto.updated_before);
    }

    if (queryDto.updated_after) {
      searchQuery.updatedAfter = new Date(queryDto.updated_after);
    }

    return searchQuery;
  }

  private async generateAdvancedSuggestions(
    query: string,
    projectId: string,
  ): Promise<string[]> {
    const suggestions: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Status suggestions
    const statuses = [
      'open',
      'in_progress',
      'completed',
      'blocked',
      'cancelled',
    ];
    statuses.forEach((status) => {
      if (status.includes(lowerQuery)) {
        suggestions.push(`status:${status}`);
      }
    });

    // Priority suggestions
    const priorities = ['urgent', 'high', 'medium', 'low'];
    priorities.forEach((priority) => {
      if (priority.includes(lowerQuery)) {
        suggestions.push(`priority:${priority}`);
      }
    });

    // Type suggestions
    const types = ['task', 'feature', 'bug', 'epic', 'story'];
    types.forEach((type) => {
      if (type.includes(lowerQuery)) {
        suggestions.push(`type:${type}`);
      }
    });

    // Date range suggestions
    if (lowerQuery.includes('today')) {
      suggestions.push('created:today', 'updated:today', 'due:today');
    }
    if (lowerQuery.includes('week')) {
      suggestions.push(
        'created:this-week',
        'updated:this-week',
        'due:this-week',
      );
    }
    if (lowerQuery.includes('month')) {
      suggestions.push(
        'created:this-month',
        'updated:this-month',
        'due:this-month',
      );
    }

    // User suggestions
    if (lowerQuery.includes('me') || lowerQuery.includes('my')) {
      suggestions.push('assignee:me', 'reporter:me');
    }

    // Combine with autocomplete results for more suggestions
    const autocompleteResults = await this.searchService.autocomplete({
      query,
      projectId,
      type: 'all',
      limit: 5,
    });

    autocompleteResults.forEach((result) => {
      if (result.type === 'tag') {
        suggestions.push(`tag:${result.text}`);
      }
    });

    return suggestions.slice(0, 10);
  }
}
