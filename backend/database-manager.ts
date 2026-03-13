#!/usr/bin/env ts-node

/**
 * Database Management Utility
 * 
 * A comprehensive script for managing database changes, fixes, and maintenance tasks.
 * Supports multiple operations with proper error handling, logging, and rollback capabilities.
 * 
 * Usage:
 *   npm run db-fix                           # Interactive mode
 *   npm run db-fix -- --operation=matviews  # Fix materialized views
 *   npm run db-fix -- --operation=indexes   # Rebuild indexes
 *   npm run db-fix -- --operation=health    # Health check
 *   npm run db-fix -- --dry-run             # Preview changes without executing
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment variables
config();

interface DatabaseOperation {
  name: string;
  description: string;
  execute: (dataSource: DataSource, options: OperationOptions) => Promise<void>;
}

interface OperationOptions {
  dryRun: boolean;
  verbose: boolean;
  force: boolean;
}

class DatabaseManager {
  private dataSource: DataSource;
  private operations: Map<string, DatabaseOperation> = new Map();

  constructor() {
    // Parse DATABASE_URL if available, otherwise use individual parameters
    const databaseUrl = process.env.DATABASE_URL;
    
    if (databaseUrl) {
      // Parse DATABASE_URL format: postgresql://user:password@host:port/database
      try {
        const url = new URL(databaseUrl);
        
        // Ensure password is a string and handle potential encoding issues
        let password = url.password;
        if (password) {
          // Try decoding if it appears to be URL-encoded
          try {
            const decoded = decodeURIComponent(password);
            // Only use decoded version if it's different (was actually encoded)
            password = decoded !== password ? decoded : password;
          } catch {
            // If decoding fails, use original password
            password = url.password;
          }
        }
        
        this.dataSource = new DataSource({
          type: 'postgres',
          host: url.hostname,
          port: parseInt(url.port) || 5432,
          username: url.username,
          password: password || '', // Ensure password is always a string
          database: url.pathname.slice(1), // Remove leading slash
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          logging: false, // Disable TypeORM logging to keep our output clean
        });
      } catch (error) {
        console.error('Failed to parse DATABASE_URL:', error.message);
        console.error('DATABASE_URL format should be: postgresql://user:password@host:port/database');
        process.exit(1);
      }
    } else {
      // Fallback to individual environment variables
      this.dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'claw_infra',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        logging: false, // Disable TypeORM logging to keep our output clean
      });
    }

    this.registerOperations();
  }

  private registerOperations() {
    this.operations.set('matviews', {
      name: 'Fix Materialized Views',
      description: 'Create missing materialized views for cost summaries',
      execute: this.fixMaterializedViews.bind(this),
    });

    this.operations.set('indexes', {
      name: 'Rebuild Indexes',
      description: 'Rebuild database indexes for optimal performance',
      execute: this.rebuildIndexes.bind(this),
    });

    this.operations.set('health', {
      name: 'Database Health Check',
      description: 'Comprehensive database health and performance check',
      execute: this.healthCheck.bind(this),
    });

    this.operations.set('cleanup', {
      name: 'Database Cleanup',
      description: 'Clean up old data and optimize database',
      execute: this.cleanup.bind(this),
    });

    this.operations.set('migrate', {
      name: 'Run Migrations',
      description: 'Execute pending database migrations',
      execute: this.runMigrations.bind(this),
    });
  }

  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to database...');
      
      // Debug connection info (without password)
      const config = this.dataSource.options as any;
      console.log(`   Host: ${config.host}:${config.port}`);
      console.log(`   Database: ${config.database}`);
      console.log(`   Username: ${config.username}`);
      console.log(`   SSL: ${config.ssl ? 'enabled' : 'disabled'}`);
      
      await this.dataSource.initialize();
      console.log('✅ Database connected successfully');
      
      // Test connection
      await this.dataSource.query('SELECT 1');
      console.log('✅ Database connection verified\n');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      
      // Provide helpful debugging info
      if (error.message.includes('SASL') || error.message.includes('password')) {
        console.error('💡 Password authentication issue detected');
        console.error('   - Check DATABASE_URL format: postgresql://user:password@host:port/database');
        console.error('   - Ensure password is properly URL-encoded if it contains special characters');
        console.error('   - Verify credentials are correct');
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.error('💡 Connection issue detected');
        console.error('   - Check if database server is running');
        console.error('   - Verify host and port are correct');
        console.error('   - Check network connectivity');
      }
      
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
      console.log('🔌 Database connection closed');
    }
  }

  async executeOperation(operationName: string, options: OperationOptions): Promise<void> {
    const operation = this.operations.get(operationName);
    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }

    console.log(`🚀 Starting: ${operation.name}`);
    console.log(`📝 Description: ${operation.description}`);
    
    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    const startTime = Date.now();
    
    try {
      await operation.execute(this.dataSource, options);
      const duration = Date.now() - startTime;
      console.log(`✅ Operation completed successfully in ${duration}ms\n`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Operation failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  private async fixMaterializedViews(dataSource: DataSource, options: OperationOptions): Promise<void> {
    console.log('🔍 Checking materialized views status...');

    // Check if materialized views exist
    const hourlyExists = await dataSource.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_matviews 
        WHERE matviewname = 'hourly_cost_summary'
      ) as exists
    `);

    const dailyExists = await dataSource.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_matviews 
        WHERE matviewname = 'daily_cost_summary'
      ) as exists
    `);

    console.log(`   Hourly materialized view exists: ${hourlyExists[0].exists ? '✅' : '❌'}`);
    console.log(`   Daily materialized view exists: ${dailyExists[0].exists ? '✅' : '❌'}`);

    const needsHourly = !hourlyExists[0].exists;
    const needsDaily = !dailyExists[0].exists;

    if (!needsHourly && !needsDaily) {
      console.log('✅ All materialized views already exist');
      
      // Refresh existing views
      if (!options.dryRun) {
        console.log('🔄 Refreshing materialized views...');
        await dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_cost_summary');
        await dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_cost_summary');
        console.log('✅ Materialized views refreshed');
      }
      return;
    }

    if (options.dryRun) {
      console.log('📋 Would create the following materialized views:');
      if (needsHourly) console.log('   - hourly_cost_summary');
      if (needsDaily) console.log('   - daily_cost_summary');
      return;
    }

    console.log('🔨 Creating missing materialized views...');

    if (needsHourly) {
      console.log('   Creating hourly_cost_summary...');
      await this.createHourlyCostSummary(dataSource);
      console.log('   ✅ hourly_cost_summary created');
    }

    if (needsDaily) {
      console.log('   Creating daily_cost_summary...');
      await this.createDailyCostSummary(dataSource);
      console.log('   ✅ daily_cost_summary created');
    }

    // Verify the views work
    console.log('🧪 Testing materialized views...');
    const hourlyCount = await dataSource.query('SELECT COUNT(*) FROM hourly_cost_summary');
    const dailyCount = await dataSource.query('SELECT COUNT(*) FROM daily_cost_summary');
    
    console.log(`   Hourly summary records: ${hourlyCount[0].count}`);
    console.log(`   Daily summary records: ${dailyCount[0].count}`);
  }

  private async createHourlyCostSummary(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      CREATE MATERIALIZED VIEW hourly_cost_summary AS
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

    await dataSource.query(`
      CREATE INDEX idx_hourly_cost_summary_hour_provider_model 
      ON hourly_cost_summary (hour, provider, model)
    `);

    await dataSource.query(`
      CREATE INDEX idx_hourly_cost_summary_hour 
      ON hourly_cost_summary (hour)
    `);
  }

  private async createDailyCostSummary(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      CREATE MATERIALIZED VIEW daily_cost_summary AS
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

    await dataSource.query(`
      CREATE INDEX idx_daily_cost_summary_day_provider_model 
      ON daily_cost_summary (day, provider, model)
    `);

    await dataSource.query(`
      CREATE INDEX idx_daily_cost_summary_day 
      ON daily_cost_summary (day)
    `);
  }

  private async rebuildIndexes(dataSource: DataSource, options: OperationOptions): Promise<void> {
    console.log('🔍 Analyzing database indexes...');

    // Get index information
    const indexes = await dataSource.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    console.log(`   Found ${indexes.length} indexes`);

    if (options.dryRun) {
      console.log('📋 Current indexes:');
      indexes.forEach(idx => {
        console.log(`   - ${idx.tablename}.${idx.indexname}`);
      });
      return;
    }

    // Rebuild indexes concurrently to avoid blocking
    console.log('🔨 Rebuilding indexes concurrently...');
    for (const index of indexes) {
      if (index.indexname.includes('_pkey')) continue; // Skip primary keys
      
      try {
        console.log(`   Rebuilding ${index.indexname}...`);
        await dataSource.query(`REINDEX INDEX CONCURRENTLY ${index.indexname}`);
      } catch (error) {
        console.warn(`   ⚠️  Failed to rebuild ${index.indexname}: ${error.message}`);
      }
    }
  }

  private async healthCheck(dataSource: DataSource, options: OperationOptions): Promise<void> {
    console.log('🏥 Running comprehensive health check...');

    // Database version and basic info
    const version = await dataSource.query('SELECT version()');
    console.log(`   PostgreSQL Version: ${version[0].version.split(' ')[1]}`);

    // Connection info
    const connections = await dataSource.query(`
      SELECT count(*) as active_connections 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `);
    console.log(`   Active Connections: ${connections[0].active_connections}`);

    // Database size
    const dbSize = await dataSource.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    console.log(`   Database Size: ${dbSize[0].size}`);

    // Table sizes
    const tableSizes = await dataSource.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    console.log('   📊 Largest Tables:');
    tableSizes.forEach(table => {
      console.log(`      ${table.tablename}: ${table.size}`);
    });

    // Check materialized views
    const matviews = await dataSource.query(`
      SELECT matviewname, ispopulated 
      FROM pg_matviews 
      WHERE schemaname = 'public'
    `);

    console.log('   📈 Materialized Views:');
    if (matviews.length === 0) {
      console.log('      ❌ No materialized views found');
    } else {
      matviews.forEach(mv => {
        const status = mv.ispopulated ? '✅' : '❌';
        console.log(`      ${status} ${mv.matviewname} (populated: ${mv.ispopulated})`);
      });
    }

    // Check for slow queries
    const slowQueries = await dataSource.query(`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements 
      WHERE mean_time > 1000
      ORDER BY mean_time DESC
      LIMIT 5
    `).catch(() => {
      console.log('   ⚠️  pg_stat_statements extension not available');
      return [];
    });

    if (slowQueries.length > 0) {
      console.log('   🐌 Slow Queries (>1s avg):');
      slowQueries.forEach(q => {
        console.log(`      ${q.mean_time.toFixed(2)}ms avg: ${q.query.substring(0, 60)}...`);
      });
    }
  }

  private async cleanup(dataSource: DataSource, options: OperationOptions): Promise<void> {
    console.log('🧹 Running database cleanup...');

    if (options.dryRun) {
      console.log('📋 Would perform the following cleanup tasks:');
      console.log('   - Vacuum analyze all tables');
      console.log('   - Update table statistics');
      console.log('   - Clean up temporary files');
      return;
    }

    // Vacuum analyze
    console.log('   Running VACUUM ANALYZE...');
    await dataSource.query('VACUUM ANALYZE');

    // Update statistics
    console.log('   Updating table statistics...');
    await dataSource.query('ANALYZE');

    console.log('✅ Database cleanup completed');
  }

  private async runMigrations(dataSource: DataSource, options: OperationOptions): Promise<void> {
    console.log('🔄 Checking for pending migrations...');

    if (options.dryRun) {
      console.log('📋 Would run pending migrations');
      return;
    }

    try {
      const migrations = await dataSource.runMigrations({ transaction: 'all' });
      if (migrations.length > 0) {
        console.log(`✅ Applied ${migrations.length} migration(s):`);
        migrations.forEach(m => console.log(`   - ${m.name}`));
      } else {
        console.log('✅ No pending migrations');
      }
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  listOperations(): void {
    console.log('📋 Available Operations:\n');
    this.operations.forEach((op, key) => {
      console.log(`   ${key.padEnd(12)} - ${op.description}`);
    });
    console.log('\n💡 Usage Examples:');
    console.log('   npm run db-fix -- --operation=matviews');
    console.log('   npm run db-fix -- --operation=health --verbose');
    console.log('   npm run db-fix -- --operation=cleanup --dry-run');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const operation = args.find(arg => arg.startsWith('--operation='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const force = args.includes('--force');
  const help = args.includes('--help') || args.includes('-h');

  const dbManager = new DatabaseManager();

  if (help) {
    console.log('🛠️  Database Management Utility\n');
    dbManager.listOperations();
    return;
  }

  if (!operation) {
    console.log('🛠️  Database Management Utility\n');
    dbManager.listOperations();
    console.log('\n❓ Please specify an operation with --operation=<name>');
    process.exit(1);
  }

  const options: OperationOptions = { dryRun, verbose, force };

  try {
    await dbManager.connect();
    await dbManager.executeOperation(operation, options);
  } catch (error) {
    console.error('\n💥 Operation failed:', error.message);
    if (verbose) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await dbManager.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch(console.error);
}