import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectLinkedRepos20260325000000 implements MigrationInterface {
  name = 'AddProjectLinkedRepos20260325000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_linked_repos" (
        "project_id" uuid NOT NULL,
        "repo_id" uuid NOT NULL,
        PRIMARY KEY ("project_id", "repo_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_linked_repos_project_id"
      ON "project_linked_repos" ("project_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_linked_repos_repo_id"
      ON "project_linked_repos" ("repo_id")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "project_linked_repos"
        ADD CONSTRAINT "FK_project_linked_repos_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "project_linked_repos"
        ADD CONSTRAINT "FK_project_linked_repos_repo_id"
        FOREIGN KEY ("repo_id") REFERENCES "code_repos"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "project_linked_repos"
    `);
  }
}
