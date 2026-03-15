import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompositeIndexes1710172800000 implements MigrationInterface {
  name = 'AddCompositeIndexes1710172800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create composite indexes using CONCURRENTLY to avoid write locks
    // This allows the migration to run without blocking production traffic

    // agent_runs: Common query pattern - filter by agent + status + time range
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_runs_agent_status_started" 
       ON "agent_runs" ("agent_name", "status", "started_at")`,
    );

    // agent_runs: Active runs timeline
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_runs_status_started" 
       ON "agent_runs" ("status", "started_at")`,
    );

    // agent_logs: Filtered log queries by run + level + time
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_logs_run_level_created" 
       ON "agent_logs" ("run_id", "level", "created_at")`,
    );

    // agent_logs: Run log timeline
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_logs_run_created" 
       ON "agent_logs" ("run_id", "created_at")`,
    );

    // cost_records: Run cost timeline
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cost_records_run_recorded" 
       ON "cost_records" ("run_id", "recorded_at")`,
    );

    // cost_records: Cost analytics by model over time
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cost_records_provider_model_recorded" 
       ON "cost_records" ("provider", "model", "recorded_at")`,
    );

    // resource_snapshots: Run metrics timeline
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_resource_snapshots_run_recorded" 
       ON "resource_snapshots" ("run_id", "recorded_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop composite indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_runs_agent_status_started"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_runs_status_started"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_logs_run_level_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_logs_run_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_cost_records_run_recorded"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_cost_records_provider_model_recorded"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_resource_snapshots_run_recorded"`,
    );
  }
}
