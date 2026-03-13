#!/usr/bin/env ts-node

/**
 * Simple database connection test
 * Use this to debug connection issues before running the full database manager
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

async function testConnection() {
  console.log('🧪 Testing database connection...\n');

  // Show environment variables (without sensitive data)
  console.log('📋 Environment Configuration:');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
  console.log(`   DB_HOST: ${process.env.DB_HOST || 'Not set'}`);
  console.log(`   DB_PORT: ${process.env.DB_PORT || 'Not set'}`);
  console.log(`   DB_USERNAME: ${process.env.DB_USERNAME || 'Not set'}`);
  console.log(`   DB_PASSWORD: ${process.env.DB_PASSWORD ? 'Set' : 'Not set'}`);
  console.log(`   DB_NAME: ${process.env.DB_NAME || 'Not set'}`);
  console.log(`   DB_SSL: ${process.env.DB_SSL || 'Not set'}\n`);

  let dataSource: DataSource;

  // Parse DATABASE_URL if available
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl) {
    console.log('🔗 Using DATABASE_URL for connection');
    try {
      const url = new URL(databaseUrl);
      console.log(`   Parsed host: ${url.hostname}`);
      console.log(`   Parsed port: ${url.port || '5432'}`);
      console.log(`   Parsed database: ${url.pathname.slice(1)}`);
      console.log(`   Parsed username: ${url.username}`);
      console.log(`   Password length: ${url.password?.length || 0} characters\n`);

      dataSource = new DataSource({
        type: 'postgres',
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        username: url.username,
        password: decodeURIComponent(url.password), // Decode URL-encoded password
        database: url.pathname.slice(1),
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        logging: false,
      });
    } catch (error) {
      console.error('❌ Failed to parse DATABASE_URL:', error.message);
      console.error('💡 Check DATABASE_URL format: postgresql://user:password@host:port/database');
      process.exit(1);
    }
  } else {
    console.log('🔧 Using individual environment variables');
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'claw_infra',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      logging: false,
    });
  }

  try {
    console.log('🔌 Attempting to connect...');
    await dataSource.initialize();
    console.log('✅ Connection successful!');

    console.log('🧪 Testing basic query...');
    const result = await dataSource.query('SELECT version()');
    console.log(`✅ PostgreSQL version: ${result[0].version.split(' ')[1]}`);

    console.log('🔍 Checking materialized views...');
    const matviews = await dataSource.query(`
      SELECT matviewname, ispopulated 
      FROM pg_matviews 
      WHERE schemaname = 'public'
    `);

    if (matviews.length === 0) {
      console.log('❌ No materialized views found - this is the issue!');
      console.log('💡 Run: npm run db:fix to create them');
    } else {
      console.log('📊 Found materialized views:');
      matviews.forEach(mv => {
        const status = mv.ispopulated ? '✅' : '❌';
        console.log(`   ${status} ${mv.matviewname}`);
      });
    }

    console.log('\n🎉 Connection test completed successfully!');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    
    if (error.message.includes('SASL') || error.message.includes('password')) {
      console.error('\n💡 Authentication troubleshooting:');
      console.error('   1. Check if password contains special characters that need URL encoding');
      console.error('   2. Verify username and password are correct');
      console.error('   3. Try connecting with a database client (pgAdmin, psql) using same credentials');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Host resolution troubleshooting:');
      console.error('   1. Check if hostname is correct');
      console.error('   2. Verify network connectivity');
      console.error('   3. Try pinging the host');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Connection refused troubleshooting:');
      console.error('   1. Check if database server is running');
      console.error('   2. Verify port number is correct');
      console.error('   3. Check firewall settings');
    }
    
    process.exit(1);
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
      console.log('🔌 Connection closed');
    }
  }
}

// Run the test
testConnection().catch(console.error);