import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostMaterializedViews1710173000000 implements MigrationInterface {
  name = 'AddCostMaterializedViews1710173000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create materialized view for daily cost summaries
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

    // Create indexes on materialized view
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day_provider_model 
      ON daily_cost_summary (day, provider, model)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day 
      ON daily_cost_summary (day)
    `);

    // Create materialized view for hourly cost summaries (last 7 days)
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

    // Create indexes on hourly materialized view
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour_provider_model 
      ON hourly_cost_summary (hour, provider, model)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour 
      ON hourly_cost_summary (hour)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS hourly_cost_summary`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS daily_cost_summary`);
  }
}
