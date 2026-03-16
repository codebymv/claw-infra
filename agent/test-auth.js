#!/usr/bin/env node

// Test script to create an API key and test the project manager

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'https://backend-production-c094.up.railway.app';

async function createTestUser() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test-agent@example.com',
        password: 'test-password-123',
        displayName: 'Test Agent'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Created test user:', data.user.email);
      return data.access_token;
    } else {
      const error = await response.text();
      console.log('ℹ️  User might already exist:', error);
      
      // Try to login instead
      const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test-agent@example.com',
          password: 'test-password-123'
        })
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        console.log('✅ Logged in as:', loginData.user.email);
        return loginData.access_token;
      } else {
        throw new Error('Failed to login: ' + await loginResponse.text());
      }
    }
  } catch (error) {
    console.error('❌ Failed to create/login user:', error.message);
    throw error;
  }
}

async function createApiKey(accessToken) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        name: 'Test Agent Key'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Created API key:', data.prefix + '...');
      return data.key;
    } else {
      throw new Error('Failed to create API key: ' + await response.text());
    }
  } catch (error) {
    console.error('❌ Failed to create API key:', error.message);
    throw error;
  }
}

async function testProjectManager(apiKey) {
  try {
    console.log('\n🧪 Testing project manager with API key...');
    
    // Set environment variables
    process.env.BACKEND_INTERNAL_URL = BACKEND_URL;
    process.env.CLAW_API_KEY = apiKey;
    
    // Import and test the project manager
    const { getProjectClient } = require('./dist/project-client');
    const client = getProjectClient();
    
    const projects = await client.listProjects({ limit: 5 });
    console.log('✅ Successfully fetched projects:', projects.length || 0, 'projects');
    
    if (projects.items && projects.items.length > 0) {
      console.log('📋 First project:', projects.items[0].name);
    } else if (projects.length > 0) {
      console.log('📋 First project:', projects[0].name);
    } else {
      console.log('📋 No projects found (this is normal for a new system)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Project manager test failed:', error.message);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 Starting authentication test...\n');
    
    const accessToken = await createTestUser();
    const apiKey = await createApiKey(accessToken);
    const success = await testProjectManager(apiKey);
    
    if (success) {
      console.log('\n✅ All tests passed!');
      console.log('🔑 API Key:', apiKey);
      console.log('\n💡 You can now use this API key with the project manager:');
      console.log(`BACKEND_INTERNAL_URL="${BACKEND_URL}" CLAW_API_KEY="${apiKey}" node project-manager.js projects`);
    } else {
      console.log('\n❌ Tests failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);