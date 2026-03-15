import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeVisibilitySchema20260307010000 implements MigrationInterface {
  name = 'AddCodeVisibilitySchema20260307010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "code_prs_state_enum" AS ENUM ('open', 'closed', 'merged');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "code_pr_reviews_state_enum" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "code_repos" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "provider" varchar NOT NULL,
        "owner" varchar NOT NULL,
        "name" varchar NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "default_branch" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_code_repos_provider_owner_name" ON "code_repos" ("provider", "owner", "name")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "code_prs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "repo_id" uuid NOT NULL,
        "external_id" varchar NOT NULL,
        "number" integer NOT NULL,
        "title" varchar NOT NULL,
        "author" varchar,
        "state" "code_prs_state_enum" NOT NULL DEFAULT 'open',
        "draft" boolean NOT NULL DEFAULT false,
        "labels" text NOT NULL DEFAULT '',
        "additions" integer NOT NULL DEFAULT 0,
        "deletions" integer NOT NULL DEFAULT 0,
        "changed_files" integer NOT NULL DEFAULT 0,
        "opened_at" timestamptz NOT NULL,
        "first_review_at" timestamptz,
        "merged_at" timestamptz,
        "closed_at" timestamptz,
        "merged_by" varchar,
        "created_at_provider" timestamptz,
        "updated_at_provider" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_code_prs_repo_id" FOREIGN KEY ("repo_id") REFERENCES "code_repos"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_code_prs_repo_number_unique" ON "code_prs" ("repo_id", "number")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_prs_state" ON "code_prs" ("state")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_prs_author" ON "code_prs" ("author")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_prs_opened_at" ON "code_prs" ("opened_at")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_prs_merged_at" ON "code_prs" ("merged_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "code_pr_reviews" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "pr_id" uuid NOT NULL,
        "external_id" varchar NOT NULL,
        "reviewer" varchar,
        "state" "code_pr_reviews_state_enum" NOT NULL,
        "submitted_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_code_pr_reviews_pr_id" FOREIGN KEY ("pr_id") REFERENCES "code_prs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_code_pr_reviews_external_id" ON "code_pr_reviews" ("external_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_pr_reviews_pr_id" ON "code_pr_reviews" ("pr_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_pr_reviews_reviewer" ON "code_pr_reviews" ("reviewer")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_pr_reviews_submitted_at" ON "code_pr_reviews" ("submitted_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "code_commits" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "repo_id" uuid NOT NULL,
        "pr_id" uuid,
        "sha" varchar NOT NULL,
        "author" varchar,
        "committed_at" timestamptz NOT NULL,
        "additions" integer NOT NULL DEFAULT 0,
        "deletions" integer NOT NULL DEFAULT 0,
        "files_changed" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_code_commits_repo_id" FOREIGN KEY ("repo_id") REFERENCES "code_repos"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_code_commits_pr_id" FOREIGN KEY ("pr_id") REFERENCES "code_prs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_code_commits_sha" ON "code_commits" ("sha")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_commits_repo_id" ON "code_commits" ("repo_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_commits_pr_id" ON "code_commits" ("pr_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_commits_author" ON "code_commits" ("author")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_code_commits_committed_at" ON "code_commits" ("committed_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "code_sync_state" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "provider" varchar NOT NULL,
        "stream" varchar NOT NULL,
        "repo_id" uuid,
        "cursor_value" varchar,
        "last_synced_at" timestamptz,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_code_sync_state_repo_id" FOREIGN KEY ("repo_id") REFERENCES "code_repos"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_code_sync_state_provider_stream_repo" ON "code_sync_state" ("provider", "stream", "repo_id")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "code_daily_metrics" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "day" date NOT NULL,
        "repo_id" uuid,
        "author" varchar,
        "prs_opened" integer NOT NULL DEFAULT 0,
        "prs_merged" integer NOT NULL DEFAULT 0,
        "commits" integer NOT NULL DEFAULT 0,
        "additions" integer NOT NULL DEFAULT 0,
        "deletions" integer NOT NULL DEFAULT 0,
        "changed_files" integer NOT NULL DEFAULT 0,
        "merge_latency_seconds_total" bigint NOT NULL DEFAULT 0,
        "merge_latency_count" integer NOT NULL DEFAULT 0,
        "first_review_latency_seconds_total" bigint NOT NULL DEFAULT 0,
        "first_review_latency_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_code_daily_metrics_day_repo_author" ON "code_daily_metrics" ("day", "repo_id", "author")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_daily_metrics_day_repo_author"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "code_daily_metrics"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_sync_state_provider_stream_repo"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "code_sync_state"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_commits_committed_at"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_commits_author"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_commits_pr_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_commits_repo_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_commits_sha"');
    await queryRunner.query('DROP TABLE IF EXISTS "code_commits"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_pr_reviews_submitted_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_pr_reviews_reviewer"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_pr_reviews_pr_id"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_pr_reviews_external_id"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "code_pr_reviews"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_prs_merged_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_prs_opened_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_prs_author"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_code_prs_state"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_prs_repo_number_unique"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "code_prs"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_code_repos_provider_owner_name"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "code_repos"');

    await queryRunner.query('DROP TYPE IF EXISTS "code_pr_reviews_state_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "code_prs_state_enum"');
  }
}
