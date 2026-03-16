import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ApiKey } from './src/database/entities/api-key.entity';
import { CryptoUtil } from './src/auth/crypto.util';

async function verifyApiKey() {
  // Get Railway database URL from environment
  const databaseUrl = process.env.DATABASE_URL;
  const apiKeySecret = process.env.API_KEY_SECRET;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  if (!apiKeySecret) {
    console.error('❌ API_KEY_SECRET environment variable is required');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [ApiKey],
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to Railway database...');
    await dataSource.initialize();
    console.log('✅ Connected to Railway database');

    const apiKeyRepo = dataSource.getRepository(ApiKey);
    
    // The API key we're testing
    const testKey = '908c54618eadf3cf14a03e4636df7bf4252344908ec554f6abf410219b4034f4';
    const prefix = testKey.substring(0, 8);
    
    console.log('🔍 Testing API Key Validation:');
    console.log('Test key:', testKey);
    console.log('Prefix:', prefix);
    console.log('Secret:', apiKeySecret);
    
    // Find API keys with this prefix
    const candidates = await apiKeyRepo.find({
      where: { keyPrefix: prefix, isActive: true }
    });
    
    console.log(`Found ${candidates.length} candidate(s) with prefix ${prefix}:`);
    
    for (const candidate of candidates) {
      console.log(`\n📋 Candidate: ${candidate.id}`);
      console.log('  Name:', candidate.name);
      console.log('  Prefix:', candidate.keyPrefix);
      console.log('  Type:', candidate.type);
      console.log('  Active:', candidate.isActive);
      console.log('  Created:', candidate.createdAt);
      console.log('  Hash (first 16 chars):', candidate.keyHash.substring(0, 16) + '...');
      
      // Test HMAC validation
      const isValid = CryptoUtil.validateHmac(testKey, candidate.keyHash, apiKeySecret);
      console.log('  HMAC Validation:', isValid ? '✅ VALID' : '❌ INVALID');
      
      if (isValid) {
        console.log('🎉 Found valid API key!');
        break;
      }
    }
    
    // Also test generating a new hash with the current secret
    console.log('\n🔧 Testing hash generation:');
    const newHash = CryptoUtil.hmacHash(testKey, apiKeySecret);
    console.log('Generated hash:', newHash);
    
    // Check if any existing key matches this new hash
    const matchingKey = candidates.find(c => c.keyHash === newHash);
    if (matchingKey) {
      console.log('✅ Generated hash matches existing key:', matchingKey.id);
    } else {
      console.log('⚠️  Generated hash does not match any existing key');
      console.log('This suggests the API_KEY_SECRET in Railway differs from what was used to seed the database');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🔌 Database connection closed');
    }
  }
}

verifyApiKey().catch(console.error);