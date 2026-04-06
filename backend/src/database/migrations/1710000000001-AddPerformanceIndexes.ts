import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1710000000001 implements MigrationInterface {
  name = 'AddPerformanceIndexes1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_status_createdAt 
      ON agent_runs(status, createdAt DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_agent_status_started 
      ON agent_runs(agentName, status, startedAt DESC)
      WHERE status IN ('running', 'queued')
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_board_status_createdAt 
      ON cards(board_id, status, createdAt DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_column_position 
      ON cards(column_id, position)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_timestamp 
      ON chat_messages(session_id, timestamp DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_card_created 
      ON comments(card_id, createdAt DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cost_records_run_created 
      ON cost_records(run_id, createdAt DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_logs_run_level_created 
      ON agent_logs(run_id, level, createdAt DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_steps_run_created 
      ON agent_steps(run_id, createdAt)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_members_user_project 
      ON project_members(userId, projectId)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_project_members_user_project`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_steps_run_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_logs_run_level_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cost_records_run_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_card_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_messages_session_timestamp`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cards_column_position`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cards_board_status_createdAt`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_runs_agent_status_started`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_runs_status_createdAt`);
  }
}