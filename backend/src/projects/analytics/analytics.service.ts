import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card, CardStatus } from '../../database/entities/card.entity';
import { CardHistory, HistoryAction } from '../../database/entities/card-history.entity';
import { Project } from '../../database/entities/project.entity';
import { KanbanBoard } from '../../database/entities/kanban-board.entity';
import { Column } from '../../database/entities/column.entity';
import { User } from '../../database/entities/user.entity';

export interface AnalyticsTimeRange {
  startDate: Date;
  endDate: Date;
}

export interface VelocityMetrics {
  completedCards: number;
  averageCompletionTime: number; // in hours
  throughput: number; // cards per day
  cycleTime: number; // average time from start to completion
  leadTime: number; // average time from creation to completion
  burndownData: Array<{
    date: string;
    remaining: number;
    completed: number;
    total: number;
  }>;
}

export interface TeamProductivityMetrics {
  totalCards: number;
  completedCards: number;
  completionRate: number;
  averageCardsPerUser: number;
  topPerformers: Array<{
    userId: string;
    username: string;
    completedCards: number;
    averageCompletionTime: number;
  }>;
  collaborationScore: number;
}

export interface ProjectInsights {
  projectId: string;
  projectName: string;
  timeRange: AnalyticsTimeRange;
  velocity: VelocityMetrics;
  productivity: TeamProductivityMetrics;
  statusDistribution: Record<CardStatus, number>;
  priorityDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  columnMetrics: Array<{
    columnId: string;
    columnName: string;
    cardCount: number;
    averageTimeInColumn: number;
    bottleneckScore: number;
  }>;
  trends: {
    cardCreationTrend: Array<{ date: string; count: number }>;
    completionTrend: Array<{ date: string; count: number }>;
    velocityTrend: Array<{ date: string; velocity: number }>;
  };
  recommendations: string[];
}

export interface CustomDashboard {
  id: string;
  name: string;
  projectId: string;
  userId: string;
  widgets: Array<{
    type: 'velocity' | 'burndown' | 'status-distribution' | 'team-performance' | 'bottlenecks';
    title: string;
    config: Record<string, any>;
    position: { x: number; y: number; width: number; height: number };
  }>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Card) private readonly cardRepo: Repository<Card>,
    @InjectRepository(CardHistory) private readonly historyRepo: Repository<CardHistory>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(KanbanBoard) private readonly boardRepo: Repository<KanbanBoard>,
    @InjectRepository(Column) private readonly columnRepo: Repository<Column>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async getProjectInsights(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<ProjectInsights> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const [
      velocity,
      productivity,
      statusDistribution,
      priorityDistribution,
      typeDistribution,
      columnMetrics,
      trends,
    ] = await Promise.all([
      this.calculateVelocityMetrics(projectId, timeRange),
      this.calculateTeamProductivityMetrics(projectId, timeRange),
      this.getStatusDistribution(projectId, timeRange),
      this.getPriorityDistribution(projectId, timeRange),
      this.getTypeDistribution(projectId, timeRange),
      this.calculateColumnMetrics(projectId, timeRange),
      this.calculateTrends(projectId, timeRange),
    ]);

    const recommendations = await this.generateRecommendations(
      projectId,
      velocity,
      productivity,
      columnMetrics
    );

    return {
      projectId,
      projectName: project.name,
      timeRange,
      velocity,
      productivity,
      statusDistribution,
      priorityDistribution,
      typeDistribution,
      columnMetrics,
      trends,
      recommendations,
    };
  }

  async calculateVelocityMetrics(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<VelocityMetrics> {
    // Get completed cards in the time range
    const completedCards = await this.cardRepo
      .createQueryBuilder('card')
      .leftJoin('card.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.status = :status', { status: CardStatus.COMPLETED })
      .andWhere('card.completedAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .getMany();

    const completedCount = completedCards.length;

    // Calculate average completion time
    let totalCompletionTime = 0;
    let totalCycleTime = 0;
    let totalLeadTime = 0;

    for (const card of completedCards) {
      if (card.completedAt && card.createdAt) {
        const leadTime = card.completedAt.getTime() - card.createdAt.getTime();
        totalLeadTime += leadTime;

        // Get the first "moved" history entry to calculate cycle time
        const startHistory = await this.historyRepo.findOne({
          where: {
            cardId: card.id,
            action: HistoryAction.MOVED,
          },
          order: { createdAt: 'ASC' },
        });

        if (startHistory && startHistory.createdAt) {
          const cycleTime = card.completedAt.getTime() - startHistory.createdAt.getTime();
          totalCycleTime += cycleTime;
        }
      }
    }

    const averageCompletionTime = completedCount > 0 ? totalCompletionTime / completedCount / (1000 * 60 * 60) : 0;
    const cycleTime = completedCount > 0 ? totalCycleTime / completedCount / (1000 * 60 * 60) : 0;
    const leadTime = completedCount > 0 ? totalLeadTime / completedCount / (1000 * 60 * 60) : 0;

    // Calculate throughput (cards per day)
    const daysDiff = Math.max(1, (timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const throughput = completedCount / daysDiff;

    // Generate burndown data
    const burndownData = await this.generateBurndownData(projectId, timeRange);

    return {
      completedCards: completedCount,
      averageCompletionTime,
      throughput,
      cycleTime,
      leadTime,
      burndownData,
    };
  }

  async calculateTeamProductivityMetrics(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<TeamProductivityMetrics> {
    // Get all cards in the project within the time range
    const allCards = await this.cardRepo
      .createQueryBuilder('card')
      .leftJoin('card.board', 'board')
      .leftJoin('card.assignee', 'assignee')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.createdAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .getMany();

    const completedCards = allCards.filter(card => card.status === CardStatus.COMPLETED);
    const totalCards = allCards.length;
    const completionRate = totalCards > 0 ? (completedCards.length / totalCards) * 100 : 0;

    // Calculate user performance metrics
    const userPerformance = new Map<string, {
      userId: string;
      username: string;
      completedCards: number;
      totalCompletionTime: number;
    }>();

    for (const card of completedCards) {
      if (card.assigneeId) {
        const existing = userPerformance.get(card.assigneeId) || {
          userId: card.assigneeId,
          username: card.assignee?.email || 'Unknown',
          completedCards: 0,
          totalCompletionTime: 0,
        };

        existing.completedCards++;
        
        if (card.completedAt && card.createdAt) {
          const completionTime = card.completedAt.getTime() - card.createdAt.getTime();
          existing.totalCompletionTime += completionTime;
        }

        userPerformance.set(card.assigneeId, existing);
      }
    }

    const topPerformers = Array.from(userPerformance.values())
      .map(user => ({
        userId: user.userId,
        username: user.username,
        completedCards: user.completedCards,
        averageCompletionTime: user.completedCards > 0 
          ? user.totalCompletionTime / user.completedCards / (1000 * 60 * 60)
          : 0,
      }))
      .sort((a, b) => b.completedCards - a.completedCards)
      .slice(0, 10);

    const averageCardsPerUser = userPerformance.size > 0 ? totalCards / userPerformance.size : 0;

    // Calculate collaboration score based on comments and card interactions
    const collaborationScore = await this.calculateCollaborationScore(projectId, timeRange);

    return {
      totalCards,
      completedCards: completedCards.length,
      completionRate,
      averageCardsPerUser,
      topPerformers,
      collaborationScore,
    };
  }

  async getStatusDistribution(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<Record<CardStatus, number>> {
    const distribution = await this.cardRepo
      .createQueryBuilder('card')
      .select('card.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('card.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.createdAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .groupBy('card.status')
      .getRawMany();

    const result: Record<CardStatus, number> = {
      [CardStatus.OPEN]: 0,
      [CardStatus.IN_PROGRESS]: 0,
      [CardStatus.BLOCKED]: 0,
      [CardStatus.COMPLETED]: 0,
      [CardStatus.CANCELLED]: 0,
    };

    distribution.forEach(item => {
      result[item.status as CardStatus] = parseInt(item.count);
    });

    return result;
  }

  async getPriorityDistribution(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<Record<string, number>> {
    const distribution = await this.cardRepo
      .createQueryBuilder('card')
      .select('card.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('card.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.createdAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .groupBy('card.priority')
      .getRawMany();

    const result: Record<string, number> = {};
    distribution.forEach(item => {
      result[item.priority] = parseInt(item.count);
    });

    return result;
  }

  async getTypeDistribution(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<Record<string, number>> {
    const distribution = await this.cardRepo
      .createQueryBuilder('card')
      .select('card.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('card.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.createdAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .groupBy('card.type')
      .getRawMany();

    const result: Record<string, number> = {};
    distribution.forEach(item => {
      result[item.type] = parseInt(item.count);
    });

    return result;
  }

  async calculateColumnMetrics(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<Array<{
    columnId: string;
    columnName: string;
    cardCount: number;
    averageTimeInColumn: number;
    bottleneckScore: number;
  }>> {
    const columns = await this.columnRepo
      .createQueryBuilder('column')
      .leftJoin('column.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .getMany();

    const columnMetrics: Array<{
      columnId: string;
      columnName: string;
      cardCount: number;
      averageTimeInColumn: number;
      bottleneckScore: number;
    }> = [];

    for (const column of columns) {
      // Get cards currently in this column
      const cardsInColumn = await this.cardRepo.count({
        where: { columnId: column.id },
      });

      // Calculate average time in column based on history
      const avgTimeQuery = await this.historyRepo
        .createQueryBuilder('history')
        .select('AVG(EXTRACT(EPOCH FROM (history.createdAt - prev_history.created_at)))', 'avg_time')
        .leftJoin('card_history', 'prev_history', 
          'prev_history.card_id = history.card_id AND prev_history.created_at < history.createdAt'
        )
        .leftJoin('cards', 'card', 'card.id = history.cardId')
        .leftJoin('kanban_boards', 'board', 'board.id = card.board_id')
        .where('board.project_id = :projectId', { projectId })
        .andWhere('history.metadata->>\'toColumnId\' = :columnId', { columnId: column.id })
        .andWhere('history.createdAt BETWEEN :startDate AND :endDate', {
          startDate: timeRange.startDate,
          endDate: timeRange.endDate,
        })
        .getRawOne();

      const averageTimeInColumn = avgTimeQuery?.avg_time ? 
        parseFloat(avgTimeQuery.avg_time) / 3600 : 0; // Convert to hours

      // Calculate bottleneck score (higher = more bottleneck)
      const bottleneckScore = this.calculateBottleneckScore(cardsInColumn, averageTimeInColumn);

      columnMetrics.push({
        columnId: column.id,
        columnName: column.name,
        cardCount: cardsInColumn,
        averageTimeInColumn,
        bottleneckScore,
      });
    }

    return columnMetrics;
  }

  async calculateTrends(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<{
    cardCreationTrend: Array<{ date: string; count: number }>;
    completionTrend: Array<{ date: string; count: number }>;
    velocityTrend: Array<{ date: string; velocity: number }>;
  }> {
    const daysDiff = Math.ceil((timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dates: string[] = [];
    
    for (let i = 0; i < daysDiff; i++) {
      const date = new Date(timeRange.startDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    // Card creation trend
    const cardCreationTrend: Array<{ date: string; count: number }> = [];
    for (const date of dates) {
      const startOfDay = new Date(date + 'T00:00:00.000Z');
      const endOfDay = new Date(date + 'T23:59:59.999Z');
      
      const count = await this.cardRepo
        .createQueryBuilder('card')
        .leftJoin('card.board', 'board')
        .where('board.projectId = :projectId', { projectId })
        .andWhere('card.createdAt BETWEEN :start AND :end', {
          start: startOfDay,
          end: endOfDay,
        })
        .getCount();

      cardCreationTrend.push({ date, count });
    }

    // Completion trend
    const completionTrend: Array<{ date: string; count: number }> = [];
    for (const date of dates) {
      const startOfDay = new Date(date + 'T00:00:00.000Z');
      const endOfDay = new Date(date + 'T23:59:59.999Z');
      
      const count = await this.cardRepo
        .createQueryBuilder('card')
        .leftJoin('card.board', 'board')
        .where('board.projectId = :projectId', { projectId })
        .andWhere('card.status = :status', { status: CardStatus.COMPLETED })
        .andWhere('card.completedAt BETWEEN :start AND :end', {
          start: startOfDay,
          end: endOfDay,
        })
        .getCount();

      completionTrend.push({ date, count });
    }

    // Velocity trend (7-day rolling average)
    const velocityTrend: Array<{ date: string; velocity: number }> = [];
    for (let i = 6; i < dates.length; i++) {
      const date = dates[i];
      const weekStart = new Date(dates[i - 6] + 'T00:00:00.000Z');
      const weekEnd = new Date(date + 'T23:59:59.999Z');
      
      const weeklyCompleted = await this.cardRepo
        .createQueryBuilder('card')
        .leftJoin('card.board', 'board')
        .where('board.projectId = :projectId', { projectId })
        .andWhere('card.status = :status', { status: CardStatus.COMPLETED })
        .andWhere('card.completedAt BETWEEN :start AND :end', {
          start: weekStart,
          end: weekEnd,
        })
        .getCount();

      const velocity = weeklyCompleted / 7; // Daily average
      velocityTrend.push({ date, velocity });
    }

    return {
      cardCreationTrend,
      completionTrend,
      velocityTrend,
    };
  }

  private async generateBurndownData(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<Array<{
    date: string;
    remaining: number;
    completed: number;
    total: number;
  }>> {
    const daysDiff = Math.ceil((timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const burndownData: Array<{
      date: string;
      remaining: number;
      completed: number;
      total: number;
    }> = [];

    // Get total cards at the start of the period
    const totalCards = await this.cardRepo
      .createQueryBuilder('card')
      .leftJoin('card.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.createdAt <= :endDate', { endDate: timeRange.endDate })
      .getCount();

    let cumulativeCompleted = 0;

    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(timeRange.startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      // Count completed cards up to this date
      const completedUpToDate = await this.cardRepo
        .createQueryBuilder('card')
        .leftJoin('card.board', 'board')
        .where('board.projectId = :projectId', { projectId })
        .andWhere('card.status = :status', { status: CardStatus.COMPLETED })
        .andWhere('card.completedAt <= :date', { date })
        .getCount();

      const remaining = Math.max(0, totalCards - completedUpToDate);

      burndownData.push({
        date: dateStr,
        remaining,
        completed: completedUpToDate,
        total: totalCards,
      });
    }

    return burndownData;
  }

  private async calculateCollaborationScore(
    projectId: string,
    timeRange: AnalyticsTimeRange
  ): Promise<number> {
    // Calculate collaboration based on comments, card assignments, and interactions
    const commentCount = await this.cardRepo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('comments', 'comment')
      .leftJoin('cards', 'card', 'card.id = comment.cardId')
      .leftJoin('kanban_boards', 'board', 'board.id = card.boardId')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('comment.createdAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .getRawOne();

    const cardCount = await this.cardRepo
      .createQueryBuilder('card')
      .leftJoin('card.board', 'board')
      .where('board.projectId = :projectId', { projectId })
      .andWhere('card.createdAt BETWEEN :startDate AND :endDate', {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      })
      .getCount();

    // Simple collaboration score: comments per card ratio (0-100)
    const commentsPerCard = cardCount > 0 ? parseInt(commentCount.count) / cardCount : 0;
    return Math.min(100, commentsPerCard * 20); // Scale to 0-100
  }

  private calculateBottleneckScore(cardCount: number, averageTime: number): number {
    // Simple bottleneck scoring: higher card count + higher average time = higher bottleneck
    const cardScore = Math.min(cardCount / 10, 1); // Normalize to 0-1
    const timeScore = Math.min(averageTime / 168, 1); // Normalize to 0-1 (168 hours = 1 week)
    return (cardScore + timeScore) * 50; // Scale to 0-100
  }

  private async generateRecommendations(
    projectId: string,
    velocity: VelocityMetrics,
    productivity: TeamProductivityMetrics,
    columnMetrics: ProjectInsights['columnMetrics']
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Velocity recommendations
    if (velocity.throughput < 1) {
      recommendations.push('Consider breaking down large cards into smaller, more manageable tasks to improve throughput.');
    }

    if (velocity.cycleTime > 168) { // More than a week
      recommendations.push('Cards are taking too long to complete. Review your workflow and identify bottlenecks.');
    }

    // Productivity recommendations
    if (productivity.completionRate < 70) {
      recommendations.push('Low completion rate detected. Consider reviewing card priorities and removing unnecessary work.');
    }

    if (productivity.collaborationScore < 30) {
      recommendations.push('Low collaboration detected. Encourage more team communication and code reviews.');
    }

    // Column bottleneck recommendations
    const bottleneckColumns = columnMetrics
      .filter(col => col.bottleneckScore > 70)
      .sort((a, b) => b.bottleneckScore - a.bottleneckScore);

    if (bottleneckColumns.length > 0) {
      recommendations.push(`Bottleneck detected in "${bottleneckColumns[0].columnName}" column. Consider adding more resources or reviewing the process.`);
    }

    // Team balance recommendations
    if (productivity.topPerformers.length > 0) {
      const topPerformer = productivity.topPerformers[0];
      const avgPerformance = productivity.averageCardsPerUser;
      
      if (topPerformer.completedCards > avgPerformance * 2) {
        recommendations.push('Work distribution appears uneven. Consider balancing workload across team members.');
      }
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }

  async exportAnalyticsReport(
    projectId: string,
    timeRange: AnalyticsTimeRange,
    format: 'json' | 'csv' = 'json'
  ): Promise<string | Buffer> {
    const insights = await this.getProjectInsights(projectId, timeRange);

    if (format === 'json') {
      return JSON.stringify(insights, null, 2);
    }

    // CSV export (simplified)
    const csvRows = [
      ['Metric', 'Value'],
      ['Project Name', insights.projectName],
      ['Time Range', `${insights.timeRange.startDate.toISOString()} - ${insights.timeRange.endDate.toISOString()}`],
      ['Completed Cards', insights.velocity.completedCards.toString()],
      ['Throughput (cards/day)', insights.velocity.throughput.toFixed(2)],
      ['Average Cycle Time (hours)', insights.velocity.cycleTime.toFixed(2)],
      ['Completion Rate (%)', insights.productivity.completionRate.toFixed(2)],
      ['Collaboration Score', insights.productivity.collaborationScore.toFixed(2)],
    ];

    return csvRows.map(row => row.join(',')).join('\n');
  }
}