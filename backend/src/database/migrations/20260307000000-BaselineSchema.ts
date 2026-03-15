import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineSchema20260307000000 implements MigrationInterface {
  name = 'BaselineSchema20260307000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_role_enum" AS ENUM ('admin', 'viewer');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "api_keys_type_enum" AS ENUM ('agent', 'dashboard');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runs_status_enum" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runs_trigger_enum" AS ENUM ('manual', 'scheduled', 'webhook', 'api');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_steps_status_enum" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_logs_level_enum" AS ENUM ('debug', 'info', 'warn', 'error');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "display_name" varchar,
        "role" "users_role_enum" NOT NULL DEFAULT 'viewer',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique" ON "users" ("email")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "key_hash" varchar NOT NULL,
        "key_prefix" varchar(8) NOT NULL,
        "type" "api_keys_type_enum" NOT NULL DEFAULT 'agent',
        "is_active" boolean NOT NULL DEFAULT true,
        "last_used_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_api_keys_key_hash_unique" ON "api_keys" ("key_hash")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "agent_name" varchar NOT NULL,
        "status" "agent_runs_status_enum" NOT NULL DEFAULT 'queued',
        "trigger" "agent_runs_trigger_enum" NOT NULL DEFAULT 'manual',
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "duration_ms" integer,
        "config_snapshot" jsonb,
        "error_message" text,
        "parent_run_id" uuid,
        "total_tokens_in" integer NOT NULL DEFAULT 0,
        "total_tokens_out" integer NOT NULL DEFAULT 0,
        "total_cost_usd" numeric(12,6) NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_agent_runs_parent_run_id" FOREIGN KEY ("parent_run_id") REFERENCES "agent_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_runs_status" ON "agent_runs" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_runs_agent_name" ON "agent_runs" ("agent_name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_runs_started_at" ON "agent_runs" ("started_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_steps" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "run_id" uuid NOT NULL,
        "step_index" integer NOT NULL,
        "tool_name" varchar,
        "step_name" varchar,
        "status" "agent_steps_status_enum" NOT NULL DEFAULT 'pending',
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "duration_ms" integer,
        "input_summary" text,
        "output_summary" text,
        "tokens_in" integer NOT NULL DEFAULT 0,
        "tokens_out" integer NOT NULL DEFAULT 0,
        "model_used" varchar,
        "provider" varchar,
        "cost_usd" numeric(12,6) NOT NULL DEFAULT 0,
        "error_message" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_agent_steps_run_id" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_steps_run_id" ON "agent_steps" ("run_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_steps_status" ON "agent_steps" ("status")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "run_id" uuid NOT NULL,
        "step_id" uuid,
        "level" "agent_logs_level_enum" NOT NULL DEFAULT 'info',
        "message" text NOT NULL,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_agent_logs_run_id" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_agent_logs_step_id" FOREIGN KEY ("step_id") REFERENCES "agent_steps"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_logs_run_id" ON "agent_logs" ("run_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_logs_level" ON "agent_logs" ("level")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_logs_created_at" ON "agent_logs" ("created_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resource_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "run_id" uuid,
        "cpu_percent" double precision NOT NULL DEFAULT 0,
        "memory_mb" double precision NOT NULL DEFAULT 0,
        "memory_percent" double precision NOT NULL DEFAULT 0,
        "disk_io_read_mb" double precision NOT NULL DEFAULT 0,
        "disk_io_write_mb" double precision NOT NULL DEFAULT 0,
        "network_in_mb" double precision NOT NULL DEFAULT 0,
        "network_out_mb" double precision NOT NULL DEFAULT 0,
        "active_connections" integer NOT NULL DEFAULT 0,
        "recorded_at" timestamptz NOT NULL,
        CONSTRAINT "FK_resource_snapshots_run_id" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_resource_snapshots_run_id" ON "resource_snapshots" ("run_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_resource_snapshots_recorded_at" ON "resource_snapshots" ("recorded_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cost_records" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "run_id" uuid NOT NULL,
        "step_id" uuid,
        "provider" varchar NOT NULL,
        "model" varchar NOT NULL,
        "tokens_in" integer NOT NULL DEFAULT 0,
        "tokens_out" integer NOT NULL DEFAULT 0,
        "cost_usd" numeric(12,6) NOT NULL,
        "recorded_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_cost_records_run_id" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cost_records_step_id" FOREIGN KEY ("step_id") REFERENCES "agent_steps"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cost_records_run_id" ON "cost_records" ("run_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cost_records_recorded_at" ON "cost_records" ("recorded_at")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cost_records_provider" ON "cost_records" ("provider")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cost_records_model" ON "cost_records" ("model")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cost_budgets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "agent_name" varchar,
        "daily_limit_usd" numeric(12,2),
        "monthly_limit_usd" numeric(12,2),
        "alert_threshold_percent" integer NOT NULL DEFAULT 80,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "cost_budgets"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cost_records_model"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cost_records_provider"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_cost_records_recorded_at"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cost_records_run_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "cost_records"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_resource_snapshots_recorded_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_resource_snapshots_run_id"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "resource_snapshots"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_logs_created_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_logs_level"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_logs_run_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "agent_logs"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_steps_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_steps_run_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "agent_steps"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_runs_started_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_runs_agent_name"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_runs_status"');
    await queryRunner.query('DROP TABLE IF EXISTS "agent_runs"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_api_keys_key_hash_unique"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "api_keys"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_email_unique"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');

    await queryRunner.query('DROP TYPE IF EXISTS "agent_logs_level_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "agent_steps_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "agent_runs_trigger_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "agent_runs_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "api_keys_type_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "users_role_enum"');
  }
}
