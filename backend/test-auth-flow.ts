import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DATABASE_ENTITIES } from './src/config/database.config';
import { AuthService } from './src/auth/auth.service';
import { ApiKey } from './src/database/entities/api-key.entity';
import { User } from './src/database/entities/user.entity';
import { JwtService } from '@nestjs/jwt';

async function testAuthFlow() {
  const databaseUrl = process.env.DATABASE_URL;
  const apiKeySecret = process.env.API_KEY_SECRET;
  
  if (!databaseUrl || !apiKeySecret) {
    console.error('❌ DATABASE_URL and API_KEY_SECRET environment variables are required');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: DATABASE_ENTITIES,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to Railway database...');
    await dataSource.initialize();
    console.log('✅ Connected to Railway database');

    // Create the services like the backend does
    const config = new ConfigService({
      API_KEY_SECRET: apiKeySecret,
      JWT_SECRET: '8f2cd4c3a2f8b0a7cea6535c466531063ceebba2189e3dcf1cf087fcb4c64007'
    });
    
    const jwtService = new JwtService();
    const userRepo = dataSource.getRepository(User);
    const apiKeyRepo = dataSource.getRepository(ApiKey);
    
    const authService = new AuthService(userRepo, apiKeyRepo, jwtService, config);
    
    // Test the API key validation
    const testKey = '908c54618eadf3cf14a03e4636df7bf4252344908ec554f6abf410219b4034f4';
    
    console.log('🔍 Testing AuthService.validateApiKey...');
    console.log('Test key:', testKey);
    console.log('API_KEY_SECRET:', apiKeySecret);
    
    try {
      const result = await authService.validateApiKey(testKey);
      if (result) {
        console.log('✅ API key validation successful!');
        console.log('Result:', {
          id: result.id,
          name: result.name,
          type: result.type,
          isActive: result.isActive
        });
      } else {
        console.log('❌ API key validation returned null');
      }
    } catch (error) {
      console.log('❌ API key validation threw an error:', error.message);
      console.log('Full error:', error);
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

testAuthFlow().catch(console.error);