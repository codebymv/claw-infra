import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentRunCardLink20260323000000 implements MigrationInterface {
  name = 'AddAgentRunCardLink20260323000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_runs"
      ADD COLUMN IF NOT EXISTS "linked_card_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_runs_linked_card_id"
      ON "agent_runs" ("linked_card_id")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "agent_runs"
        ADD CONSTRAINT "FK_agent_runs_linked_card_id"
        FOREIGN KEY ("linked_card_id") REFERENCES "cards"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_runs"
      DROP CONSTRAINT IF EXISTS "FK_agent_runs_linked_card_id"
    `);

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_runs_linked_card_id"',
    );

    await queryRunner.query(`
      ALTER TABLE "agent_runs"
      DROP COLUMN IF EXISTS "linked_card_id"
    `);
  }
}