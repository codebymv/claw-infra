import { Controller, Post, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/fix')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class FixViewsController {
  constructor(private readonly dataSource: DataSource) {}

  @Post('materialized-views')
  async fixMaterializedViews() {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      // Create daily_cost_summary materialized view
      await queryRunner.query(`
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

      // Create indexes for daily_cost_summary
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day_provider_model 
        ON daily_cost_summary (day, provider, model)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day 
        ON daily_cost_summary (day)
      `);

      // Create hourly_cost_summary materialized view
      await queryRunner.query(`
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

      // Create indexes for hourly_cost_summary
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour_provider_model 
        ON hourly_cost_summary (hour, provider, model)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour 
        ON hourly_cost_summary (hour)
      `);

      // Refresh the materialized views
      await queryRunner.query('REFRESH MATERIALIZED VIEW daily_cost_summary');
      await queryRunner.query('REFRESH MATERIALIZED VIEW hourly_cost_summary');

      return {
        success: true,
        message: 'Materialized views created and refreshed successfully',
        views: ['daily_cost_summary', 'hourly_cost_summary'],
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create materialized views',
        error: error.message,
      };
    } finally {
      await queryRunner.release();
    }
  }
}
