#!/usr/bin/env node

// Test different authentication methods

const BACKEND_URL = 'https://backend-production-c094.up.railway.app';

async function testApiKey(apiKey) {
  try {
    console.log(`🔑 Testing API key: ${apiKey.substring(0, 8)}...`);
    
    const response = await fetch(`${BACKEND_URL}/api/projects?limit=1`, {
      headers: {
        'x-agent-token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API key works!', data);
      return true;
    } else {
      const error = await response.text();
      console.log('❌ API key failed:', response.status, error);
      return false;
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
    return false;
  }
}

async function testJwtToken(token) {
  try {
    console.log(`🎫 Testing JWT token: ${token.substring(0, 20)}...`);
    
    const response = await fetch(`${BACKEND_URL}/api/projects?limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ JWT token works!', data);
      return true;
    } else {
      const error = await response.text();
      console.log('❌ JWT token failed:', response.status, error);
      return false;
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing authentication methods...\n');

  // Test the API key you provided
  const apiKey = process.env.AGENT_API_KEY || '908c54618eadf3cf14a03e4';
  await testApiKey(apiKey);

  console.log('\n💡 To test with JWT token:');
  console.log('1. Login to your claw-infra web interface');
  console.log('2. Open browser dev tools → Network tab');
  console.log('3. Look for Authorization: Bearer <token> in any request');
  console.log('4. Run: JWT_TOKEN="your-token" node test-auth-methods.js');

  if (process.env.JWT_TOKEN) {
    console.log('\n');
    await testJwtToken(process.env.JWT_TOKEN);
  }

  console.log('\n🎯 Next steps:');
  console.log('- Get your complete API key from claw-infra dashboard');
  console.log('- Or use your JWT token from the browser');
}

main().catch(console.error);