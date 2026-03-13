import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class CostRefreshService {
  private readonly logger = new Logger(CostRefreshService.name);
  private materializedViewsCreated = false;

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Ensure materialized views exist before attempting to refresh them
   */
  private async ensureMaterializedViewsExist() {
    if (this.materializedViewsCreated) return;

    try {
      // Check if materialized views exist
      const hourlyExists = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_matviews 
          WHERE matviewname = 'hourly_cost_summary'
        ) as exists
      `);

      const dailyExists = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_matviews 
          WHERE matviewname = 'daily_cost_summary'
        ) as exists
      `);

      if (!hourlyExists[0].exists) {
        this.logger.warn('Creating missing hourly_cost_summary materialized view');
        await this.createHourlyCostSummary();
      }

      if (!dailyExists[0].exists) {
        this.logger.warn('Creating missing daily_cost_summary materialized view');
        await this.createDailyCostSummary();
      }

      this.materializedViewsCreated = true;
      this.logger.log('Materialized views verified/created successfully');
    } catch (error) {
      this.logger.error(`Failed to ensure materialized views exist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create hourly cost summary materialized view
   */
  private async createHourlyCostSummary() {
    await this.dataSource.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_cost_summary AS
      SELECT 
        DATE_TRUNC('hour', recorded_at) as hour,
        provider,
        model,
        SUM(CAST(cost_usd AS DECIMAL)) as total_cost_usd,
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out,
        COUNT(*) as call_count
      FROM cost_records
      WHERE recorded_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('hour', recorded_at), provider, model
    `);

    // Create indexes
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour_provider_model 
      ON hourly_cost_summary (hour, provider, model)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour 
      ON hourly_cost_summary (hour)
    `);
  }

  /**
   * Create daily cost summary materialized view
   */
  private async createDailyCostSummary() {
    await this.dataSource.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS daily_cost_summary AS
      SELECT 
        DATE_TRUNC('day', recorded_at) as day,
        provider,
        model,
        SUM(CAST(cost_usd AS DECIMAL)) as total_cost_usd,
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out,
        COUNT(*) as call_count
      FROM cost_records
      WHERE recorded_at < DATE_TRUNC('day', NOW())
      GROUP BY DATE_TRUNC('day', recorded_at), provider, model
    `);

    // Create indexes
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day_provider_model 
      ON daily_cost_summary (day, provider, model)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day 
      ON daily_cost_summary (day)
    `);
  }

  /**
   * Refresh hourly cost summary every 5 minutes
   * Covers the last 7 days of data
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshHourlySummary() {
    try {
      await this.ensureMaterializedViewsExist();
      
      const start = Date.now();
      await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_cost_summary');
      const duration = Date.now() - start;
      this.logger.log(`Refreshed hourly_cost_summary in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Failed to refresh hourly_cost_summary: ${error.message}`);
      
      // If the error is about missing materialized view, reset the flag to retry creation
      if (error.message.includes('does not exist')) {
        this.materializedViewsCreated = false;
      }
    }
  }

  /**
   * Refresh daily cost summary every hour
   * Covers all historical data
   */
  @Cron(CronExpression.EVERY_HOUR)
  async refreshDailySummary() {
    try {
      await this.ensureMaterializedViewsExist();
      
      const start = Date.now();
      await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_cost_summary');
      const duration = Date.now() - start;
      this.logger.log(`Refreshed daily_cost_summary in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Failed to refresh daily_cost_summary: ${error.message}`);
      
      // If the error is about missing materialized view, reset the flag to retry creation
      if (error.message.includes('does not exist')) {
        this.materializedViewsCreated = false;
      }
    }
  }
}
