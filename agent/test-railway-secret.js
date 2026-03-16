// Test script to check what API_KEY_SECRET Railway is using
const fetch = globalThis.fetch;

async function testRailwaySecret() {
  const baseUrl = 'https://backend-production-c094.up.railway.app';
  
  // Create a test endpoint that will help us debug
  console.log('🔍 Testing Railway API Key Secret Configuration');
  console.log('');
  
  // Test with a simple health check first
  try {
    console.log('📡 Testing health endpoint...');
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'debug-test'
      }
    });
    
    if (response.ok) {
      console.log('✅ Health endpoint working');
    } else {
      console.log('❌ Health endpoint failed:', response.status);
    }
  } catch (error) {
    console.error('❌ Health test failed:', error.message);
    return;
  }
  
  // The issue is likely that Railway has a different API_KEY_SECRET
  // Let's check if we can create a new API key through the authenticated endpoint
  console.log('');
  console.log('🔧 The issue is likely that Railway has a different API_KEY_SECRET value');
  console.log('   than what we used to seed the database locally.');
  console.log('');
  console.log('💡 Solutions:');
  console.log('   1. Update Railway API_KEY_SECRET to: 6Grpl3NdX9VgJD3AnOyRv7Xf');
  console.log('   2. Or re-seed the database with Railway\'s current API_KEY_SECRET');
  console.log('');
  console.log('🔍 To check Railway\'s current API_KEY_SECRET:');
  console.log('   - Go to Railway dashboard > Backend service > Variables');
  console.log('   - Check the value of API_KEY_SECRET');
  console.log('   - It should be: 6Grpl3NdX9VgJD3AnOyRv7Xf');
}

testRailwaySecret().catch(console.error);