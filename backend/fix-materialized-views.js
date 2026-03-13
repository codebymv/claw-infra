const { Client } = require('pg');
const { config } = require('dotenv');

// Load environment variables from .env file
config();

async function createMaterializedViews() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not found');
    console.log('Make sure you have a .env file with DATABASE_URL set');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    console.log('Creating daily_cost_summary materialized view...');
    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS daily_cost_summary AS
      SELECT 
        DATE_TRUNC('day', recorded_at) as day,
        provider,
        model,
        SUM(CAST(cost_usd AS DECIMAL)) as total_cost_usd,
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out,
        COUNT(*) as call_count
      FROM cost_records
      WHERE recorded_at < DATE_TRUNC('day', NOW())
      GROUP BY DATE_TRUNC('day', recorded_at), provider, model
    `);

    console.log('Creating indexes for daily_cost_summary...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day_provider_model 
      ON daily_cost_summary (day, provider, model)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_cost_summary_day 
      ON daily_cost_summary (day)
    `);

    console.log('Creating hourly_cost_summary materialized view...');
    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_cost_summary AS
      SELECT 
        DATE_TRUNC('hour', recorded_at) as hour,
        provider,
        model,
        SUM(CAST(cost_usd AS DECIMAL)) as total_cost_usd,
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out,
        COUNT(*) as call_count
      FROM cost_records
      WHERE recorded_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('hour', recorded_at), provider, model
    `);

    console.log('Creating indexes for hourly_cost_summary...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour_provider_model 
      ON hourly_cost_summary (hour, provider, model)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_hourly_cost_summary_hour 
      ON hourly_cost_summary (hour)
    `);

    console.log('Refreshing materialized views...');
    await client.query('REFRESH MATERIALIZED VIEW daily_cost_summary');
    await client.query('REFRESH MATERIALIZED VIEW hourly_cost_summary');

    console.log('✅ Materialized views created and refreshed successfully!');
    console.log('Cost analytics endpoints should now work properly.');

  } catch (error) {
    console.error('❌ Error creating materialized views:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure DATABASE_URL is set in your .env file');
    console.log('2. Check that you have permission to create materialized views');
    console.log('3. Verify the database connection is working');
    process.exit(1);
  } finally {
    await client.end();
  }
}

createMaterializedViews();