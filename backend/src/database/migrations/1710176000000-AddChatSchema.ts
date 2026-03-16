import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatSchema1710176000000 implements MigrationInterface {
  name = 'AddChatSchema1710176000000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // Create chat_sessions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "last_activity" timestamptz NOT NULL DEFAULT NOW(),
        "message_count" integer NOT NULL DEFAULT 0,
        "active_project_id" uuid,
        "preferences" jsonb NOT NULL DEFAULT '{}',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "FK_chat_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_sessions_project" FOREIGN KEY ("active_project_id") REFERENCES "projects"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_chat_sessions_user" UNIQUE ("user_id")
      )
    `);

    // Create chat_messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "content" text NOT NULL,
        "timestamp" timestamptz NOT NULL DEFAULT NOW(),
        "source" varchar(20) NOT NULL CHECK ("source" IN ('web', 'telegram')),
        "type" varchar(20) NOT NULL CHECK ("type" IN ('message', 'command', 'response', 'system')),
        "command_id" uuid,
        "project_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "FK_chat_messages_session" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_messages_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_messages_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL
      )
    `);

    // Create optimized indexes for chat functionality
    
    // Chat sessions indexes
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_sessions_user" ON "chat_sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_sessions_last_activity" ON "chat_sessions" ("last_activity")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_sessions_active_project" ON "chat_sessions" ("active_project_id") WHERE "active_project_id" IS NOT NULL`,
    );

    // Chat messages indexes - critical for performance
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_session_timestamp" ON "chat_messages" ("session_id", "timestamp" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_user_timestamp" ON "chat_messages" ("user_id", "timestamp" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_source_type" ON "chat_messages" ("source", "type")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_command_id" ON "chat_messages" ("command_id") WHERE "command_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_project_timestamp" ON "chat_messages" ("project_id", "timestamp" DESC) WHERE "project_id" IS NOT NULL`,
    );

    // Full-text search index for chat messages
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_search" 
      ON "chat_messages" USING gin(to_tsvector('english', "content"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_sessions_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_sessions_last_activity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_sessions_active_project"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_session_timestamp"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_user_timestamp"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_source_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_command_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_project_timestamp"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_search"`);

    // Drop tables in reverse order (respecting foreign key constraints)
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions"`);
  }
}