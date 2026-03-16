// Debug Railway authentication specifically
const fetch = globalThis.fetch;

async function debugRailwayAuth() {
  const baseUrl = 'https://backend-production-c094.up.railway.app';
  const apiKey = '908c54618eadf3cf14a03e4636df7bf4252344908ec554f6abf410219b4034f4';
  
  console.log('🔍 Debugging Railway Authentication');
  console.log('Backend URL:', baseUrl);
  console.log('API Key (first 16 chars):', apiKey.substring(0, 16) + '...');
  console.log('');

  // Test 1: Simple endpoint that should work with API key
  console.log('📡 Test 1: GET /api/health (no auth required)');
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'debug-test'
      }
    });
    
    console.log('Status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Health check passed:', data.status);
    } else {
      console.log('❌ Health check failed');
    }
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    return;
  }
  
  console.log('');
  
  // Test 2: Try a different authenticated endpoint
  console.log('📡 Test 2: GET /api/agents (should work with API key)');
  try {
    const response = await fetch(`${baseUrl}/api/agents`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': apiKey,
        'User-Agent': 'debug-test'
      }
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    
    if (response.ok) {
      console.log('✅ Agents endpoint works with API key');
    } else if (response.status === 401) {
      console.log('❌ API key authentication failed');
    } else if (response.status === 500) {
      console.log('❌ Server error - likely authentication passed but service failed');
    }
  } catch (error) {
    console.error('❌ Agents endpoint error:', error.message);
  }
  
  console.log('');
  
  // Test 3: Try projects endpoint again
  console.log('📡 Test 3: GET /api/projects (the failing endpoint)');
  try {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': apiKey,
        'User-Agent': 'debug-test'
      }
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    
    if (response.ok) {
      console.log('✅ Projects endpoint works!');
    } else if (response.status === 401) {
      console.log('❌ API key authentication failed');
    } else if (response.status === 500) {
      console.log('❌ Server error - likely authentication passed but service failed');
    }
  } catch (error) {
    console.error('❌ Projects endpoint error:', error.message);
  }
  
  console.log('');
  console.log('💡 Analysis:');
  console.log('- If health works but authenticated endpoints fail with 401: API key auth issue');
  console.log('- If health works but authenticated endpoints fail with 500: Service logic issue');
  console.log('- If different endpoints behave differently: Specific service issue');
}

debugRailwayAuth().catch(console.error);