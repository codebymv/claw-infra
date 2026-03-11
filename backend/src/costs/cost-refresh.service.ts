import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class CostRefreshService {
  private readonly logger = new Logger(CostRefreshService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Refresh hourly cost summary every 5 minutes
   * Covers the last 7 days of data
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshHourlySummary() {
    try {
      const start = Date.now();
      await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_cost_summary');
      const duration = Date.now() - start;
      this.logger.log(`Refreshed hourly_cost_summary in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Failed to refresh hourly_cost_summary: ${error.message}`);
    }
  }

  /**
   * Refresh daily cost summary every hour
   * Covers all historical data
   */
  @Cron(CronExpression.EVERY_HOUR)
  async refreshDailySummary() {
    try {
      const start = Date.now();
      await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_cost_summary');
      const duration = Date.now() - start;
      this.logger.log(`Refreshed daily_cost_summary in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Failed to refresh daily_cost_summary: ${error.message}`);
    }
  }
}
