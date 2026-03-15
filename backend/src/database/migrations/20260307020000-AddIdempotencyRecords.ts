import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyRecords20260307020000 implements MigrationInterface {
  name = 'AddIdempotencyRecords20260307020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "idempotency_records" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "key_hash" varchar(64) NOT NULL,
        "route" varchar NOT NULL,
        "token_prefix" varchar(16),
        "status_code" integer NOT NULL DEFAULT 200,
        "response_body" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL
      )
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_idempotency_records_key_hash_unique" ON "idempotency_records" ("key_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_idempotency_records_expires_at" ON "idempotency_records" ("expires_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_idempotency_records_expires_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_idempotency_records_key_hash_unique"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "idempotency_records"');
  }
}
