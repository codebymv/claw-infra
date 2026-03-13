import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectManagementSchema1710175000000 implements MigrationInterface {
  name = 'AddProjectManagementSchema1710175000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create projects table
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "description" text,
        "slug" varchar(100) NOT NULL UNIQUE,
        "owner_id" uuid NOT NULL,
        "team_id" uuid,
        "status" varchar NOT NULL DEFAULT 'active',
        "visibility" varchar NOT NULL DEFAULT 'private',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "archived_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_projects_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create project_members table
    await queryRunner.query(`
      CREATE TABLE "project_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '[]',
        "joined_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_project_members_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_project_members_project_user" UNIQUE ("project_id", "user_id")
      )
    `);

    // Create kanban_boards table
    await queryRunner.query(`
      CREATE TABLE "kanban_boards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "is_default" boolean NOT NULL DEFAULT false,
        "layout" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_kanban_boards_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    // Create columns table
    await queryRunner.query(`
      CREATE TABLE "columns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "color" varchar(7) NOT NULL DEFAULT '#6B7280',
        "order" int NOT NULL,
        "wip_limit" int,
        "is_completed" boolean NOT NULL DEFAULT false,
        "rules" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_columns_board" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE CASCADE
      )
    `);

    // Create cards table
    await queryRunner.query(`
      CREATE TABLE "cards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "column_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "type" varchar NOT NULL DEFAULT 'task',
        "priority" varchar NOT NULL DEFAULT 'medium',
        "status" varchar NOT NULL DEFAULT 'open',
        "assignee_id" uuid,
        "reporter_id" uuid NOT NULL,
        "estimated_hours" decimal(8,2),
        "actual_hours" decimal(8,2),
        "due_date" timestamptz,
        "tags" text[] NOT NULL DEFAULT '{}',
        "custom_fields" jsonb NOT NULL DEFAULT '{}',
        "position" int NOT NULL,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_cards_board" FOREIGN KEY ("board_id") REFERENCES "kanban_boards"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cards_column" FOREIGN KEY ("column_id") REFERENCES "columns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cards_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cards_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create comments table
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "card_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "content" text NOT NULL,
        "content_html" text NOT NULL,
        "mentions" text[] NOT NULL DEFAULT '{}',
        "is_edited" boolean NOT NULL DEFAULT false,
        "parent_id" uuid,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_comments_card" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_parent" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE
      )
    `);

    // Create card_history table
    await queryRunner.query(`
      CREATE TABLE "card_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "card_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "action" varchar NOT NULL,
        "field" varchar(100),
        "old_value" text,
        "new_value" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_card_history_card" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_card_history_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create optimized indexes using CONCURRENTLY to avoid write locks
    
    // Projects indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_projects_owner_status" ON "projects" ("owner_id", "status")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_projects_team_status" ON "projects" ("team_id", "status") WHERE "team_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_projects_slug_active" ON "projects" ("slug") WHERE "status" = 'active'`);

    // Project members indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_members_project" ON "project_members" ("project_id")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_members_user" ON "project_members" ("user_id")`);

    // Kanban boards indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_kanban_boards_project" ON "kanban_boards" ("project_id")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_kanban_boards_project_default" ON "kanban_boards" ("project_id", "is_default")`);

    // Columns indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_columns_board" ON "columns" ("board_id")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_columns_board_order" ON "columns" ("board_id", "order")`);

    // Cards indexes - critical for performance
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cards_board_column" ON "cards" ("board_id", "column_id")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cards_assignee_status" ON "cards" ("assignee_id", "status") WHERE "assignee_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cards_board_column_position" ON "cards" ("board_id", "column_id", "position")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cards_board_status" ON "cards" ("board_id", "status")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cards_created_at" ON "cards" ("created_at")`);

    // Full-text search index for cards
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cards_search" 
      ON "cards" USING gin(to_tsvector('english', "title" || ' ' || COALESCE("description", '')))
    `);

    // Comments indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_comments_card_created" ON "comments" ("card_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_comments_author" ON "comments" ("author_id")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_comments_parent" ON "comments" ("parent_id") WHERE "parent_id" IS NOT NULL`);

    // Card history indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_card_history_card_created" ON "card_history" ("card_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_card_history_user" ON "card_history" ("user_id")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_card_history_action" ON "card_history" ("action")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_projects_owner_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_projects_team_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_projects_slug_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_project_members_project"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_project_members_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kanban_boards_project"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kanban_boards_project_default"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_columns_board"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_columns_board_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cards_board_column"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cards_assignee_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cards_board_column_position"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cards_board_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cards_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cards_search"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_card_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_author"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_history_card_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_history_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_history_action"`);

    // Drop tables in reverse order (respecting foreign key constraints)
    await queryRunner.query(`DROP TABLE IF EXISTS "card_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "columns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kanban_boards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
  }
}