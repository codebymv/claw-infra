import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGithubInstallations1711324000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS github_installations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id BIGINT NOT NULL,
        account_login VARCHAR NOT NULL,
        account_type VARCHAR NOT NULL DEFAULT 'User',
        access_token TEXT,
        token_expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_github_installations_installation_id
      ON github_installations (installation_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS github_repo_grants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id UUID NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
        repo_full_name VARCHAR NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repo_grants_install_repo
      ON github_repo_grants (installation_id, repo_full_name)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS github_repo_grants CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS github_installations CASCADE`,
    );
  }
}
