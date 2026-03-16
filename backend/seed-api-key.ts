import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ApiKey, ApiKeyType } from './src/database/entities/api-key.entity';
import { CryptoUtil } from './src/auth/crypto.util';

async function seedApiKey() {
  // Create a minimal config service
  const config = new ConfigService({
    DATABASE_URL: process.env.DATABASE_URL,
    API_KEY_SECRET: process.env.API_KEY_SECRET || '6Grpl3NdX9VgJD3AnOyRv7Xf'
  });

  const dataSource = new DataSource({
    type: 'postgres',
    url: config.get<string>('DATABASE_URL'),
    entities: [ApiKey],
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔌 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const apiKeyRepo = dataSource.getRepository(ApiKey);
    const apiKeySecret = config.get<string>('API_KEY_SECRET');
    
    if (!apiKeySecret) {
      throw new Error('API_KEY_SECRET environment variable is required');
    }

    // The API key we want to seed
    const rawKey = '908c54618eadf3cf14a03e4636df7bf4252344908ec554f6abf410219b4034f4';
    const prefix = rawKey.substring(0, 8);
    const keyHash = CryptoUtil.hmacHash(rawKey, apiKeySecret);

    console.log('🔍 API Key Details:');
    console.log('Raw key:', rawKey);
    console.log('Prefix:', prefix);
    console.log('Secret used:', apiKeySecret);
    console.log('Generated hash:', keyHash);

    // Check if API key already exists
    const existing = await apiKeyRepo.findOne({
      where: { keyPrefix: prefix }
    });

    if (existing) {
      console.log('⚠️  API key with this prefix already exists:', existing.id);
      console.log('Existing key details:', {
        id: existing.id,
        name: existing.name,
        keyPrefix: existing.keyPrefix,
        type: existing.type,
        isActive: existing.isActive,
        createdAt: existing.createdAt
      });
      
      // Update the existing key with the correct hash
      await apiKeyRepo.update(existing.id, {
        keyHash: keyHash,
        isActive: true,
        name: 'ZeroClaw Agent Key (Updated)'
      });
      console.log('✅ Updated existing API key with new hash');
    } else {
      // Create new API key
      const apiKey = apiKeyRepo.create({
        name: 'ZeroClaw Agent Key',
        keyHash: keyHash,
        keyPrefix: prefix,
        type: ApiKeyType.AGENT,
        isActive: true
      });

      await apiKeyRepo.save(apiKey);
      console.log('✅ Created new API key:', apiKey.id);
    }

    // Verify the key can be validated
    console.log('🔍 Testing validation...');
    const testValidation = CryptoUtil.validateHmac(rawKey, keyHash, apiKeySecret);
    console.log('Validation test result:', testValidation ? '✅ PASS' : '❌ FAIL');

  } catch (error) {
    console.error('❌ Error seeding API key:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the seeding
seedApiKey().catch(console.error);