import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Request,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AnalyticsService, AnalyticsTimeRange } from './analytics.service';
import { ProjectAuthGuard } from '../auth/project-auth.guard';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { AuditLogService } from '../auth/audit-log.service';

export class AnalyticsQueryDto {
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
  format?: 'json' | 'csv';
}

@Controller('projects/:projectId/analytics')
@UseGuards(ProjectAuthGuard, ProjectAccessGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('insights')
  async getProjectInsights(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const insights = await this.analyticsService.getProjectInsights(projectId, timeRange);

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.insights',
        resource: 'analytics',
        resourceId: 'insights',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
        },
      });

      return insights;
    } catch (error) {
      throw new HttpException(
        `Failed to generate project insights: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('velocity')
  async getVelocityMetrics(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const velocity = await this.analyticsService.calculateVelocityMetrics(projectId, timeRange);

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.velocity',
        resource: 'analytics',
        resourceId: 'velocity',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
          completedCards: velocity.completedCards,
          throughput: velocity.throughput,
        },
      });

      return velocity;
    } catch (error) {
      throw new HttpException(
        `Failed to calculate velocity metrics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('productivity')
  async getProductivityMetrics(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const productivity = await this.analyticsService.calculateTeamProductivityMetrics(projectId, timeRange);

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.productivity',
        resource: 'analytics',
        resourceId: 'productivity',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
          totalCards: productivity.totalCards,
          completionRate: productivity.completionRate,
        },
      });

      return productivity;
    } catch (error) {
      throw new HttpException(
        `Failed to calculate productivity metrics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('distributions')
  async getDistributions(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const [statusDistribution, priorityDistribution, typeDistribution] = await Promise.all([
        this.analyticsService.getStatusDistribution(projectId, timeRange),
        this.analyticsService.getPriorityDistribution(projectId, timeRange),
        this.analyticsService.getTypeDistribution(projectId, timeRange),
      ]);

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.distributions',
        resource: 'analytics',
        resourceId: 'distributions',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
        },
      });

      return {
        status: statusDistribution,
        priority: priorityDistribution,
        type: typeDistribution,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to calculate distributions: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('trends')
  async getTrends(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const trends = await this.analyticsService.calculateTrends(projectId, timeRange);

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.trends',
        resource: 'analytics',
        resourceId: 'trends',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
        },
      });

      return trends;
    } catch (error) {
      throw new HttpException(
        `Failed to calculate trends: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('columns')
  async getColumnMetrics(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const columnMetrics = await this.analyticsService.calculateColumnMetrics(projectId, timeRange);

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.columns',
        resource: 'analytics',
        resourceId: 'columns',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
          columnsAnalyzed: columnMetrics.length,
        },
      });

      return { columns: columnMetrics };
    } catch (error) {
      throw new HttpException(
        `Failed to calculate column metrics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('export')
  async exportAnalyticsReport(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    const format = queryDto.format || 'json';
    
    if (!['json', 'csv'].includes(format)) {
      throw new BadRequestException('Format must be either "json" or "csv"');
    }

    try {
      const report = await this.analyticsService.exportAnalyticsReport(
        projectId,
        timeRange,
        format as 'json' | 'csv',
      );

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.export',
        resource: 'analytics',
        resourceId: 'export',
        projectId,
        metadata: {
          format,
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
        },
      });

      if (format === 'csv') {
        return {
          format: 'csv',
          data: report,
          filename: `project-${projectId}-analytics-${timeRange.startDate.toISOString().split('T')[0]}-to-${timeRange.endDate.toISOString().split('T')[0]}.csv`,
        };
      }

      return {
        format: 'json',
        data: JSON.parse(report as string),
        filename: `project-${projectId}-analytics-${timeRange.startDate.toISOString().split('T')[0]}-to-${timeRange.endDate.toISOString().split('T')[0]}.json`,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to export analytics report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('summary')
  async getAnalyticsSummary(
    @Param('projectId') projectId: string,
    @Query() queryDto: AnalyticsQueryDto,
    @Request() req: any,
  ) {
    const timeRange = this.buildTimeRange(queryDto);
    
    try {
      const [velocity, productivity, distributions] = await Promise.all([
        this.analyticsService.calculateVelocityMetrics(projectId, timeRange),
        this.analyticsService.calculateTeamProductivityMetrics(projectId, timeRange),
        Promise.all([
          this.analyticsService.getStatusDistribution(projectId, timeRange),
          this.analyticsService.getPriorityDistribution(projectId, timeRange),
        ]),
      ]);

      const summary = {
        timeRange,
        overview: {
          completedCards: velocity.completedCards,
          throughput: velocity.throughput,
          completionRate: productivity.completionRate,
          collaborationScore: productivity.collaborationScore,
        },
        distributions: {
          status: distributions[0],
          priority: distributions[1],
        },
        topPerformers: productivity.topPerformers.slice(0, 3),
      };

      await this.auditLogService.logAccess({
        userId: req.user.id,
        action: 'analytics.summary',
        resource: 'analytics',
        resourceId: 'summary',
        projectId,
        metadata: {
          timeRange: {
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString(),
          },
        },
      });

      return summary;
    } catch (error) {
      throw new HttpException(
        `Failed to generate analytics summary: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private buildTimeRange(queryDto: AnalyticsQueryDto): AnalyticsTimeRange {
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const defaultEndDate = now;

    let startDate = defaultStartDate;
    let endDate = defaultEndDate;

    if (queryDto.start_date) {
      startDate = new Date(queryDto.start_date);
      if (isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid start_date format. Use ISO date string.');
      }
    }

    if (queryDto.end_date) {
      endDate = new Date(queryDto.end_date);
      if (isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid end_date format. Use ISO date string.');
      }
    }

    if (startDate >= endDate) {
      throw new BadRequestException('start_date must be before end_date');
    }

    // Limit to maximum 1 year range
    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      throw new BadRequestException('Date range cannot exceed 1 year');
    }

    return { startDate, endDate };
  }
}