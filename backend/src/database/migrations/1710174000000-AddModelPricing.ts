import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModelPricing1710174000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create model_pricing table
    await queryRunner.query(`
      CREATE TABLE model_pricing (
        provider VARCHAR(100) NOT NULL,
        model VARCHAR(200) NOT NULL,
        effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
        input_price_per_million DECIMAL(12, 6) NOT NULL,
        output_price_per_million DECIMAL(12, 6) NOT NULL,
        cache_discount DECIMAL(5, 4) NOT NULL DEFAULT 1.0000,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (provider, model, effective_date)
      );
    `);

    // Create index for active pricing lookups
    await queryRunner.query(`
      CREATE INDEX idx_model_pricing_active 
      ON model_pricing (provider, model, effective_date DESC) 
      WHERE is_active = true;
    `);

    // Migrate existing hardcoded pricing to database
    // Based on PRICING_MAP from costs.service.ts
    const now = new Date().toISOString();
    
    await queryRunner.query(`
      INSERT INTO model_pricing 
        (provider, model, effective_date, input_price_per_million, output_price_per_million, cache_discount, notes)
      VALUES
        ('anthropic', 'claude-sonnet-4-6', '2026-01-01', 3.0, 15.0, 0.1, 'Migrated from hardcoded PRICING_MAP'),
        ('openai', 'gpt-5.3-codex', '2026-01-01', 1.75, 14.0, 0.1, 'Migrated from hardcoded PRICING_MAP')
      ON CONFLICT (provider, model, effective_date) DO NOTHING;
    `);

    console.log('✅ Model pricing table created and seeded with existing pricing');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_model_pricing_active;`);
    await queryRunner.query(`DROP TABLE IF EXISTS model_pricing;`);
  }
}
