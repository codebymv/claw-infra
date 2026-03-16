// Use built-in fetch (Node.js 18+)
const fetch = globalThis.fetch;

async function testAuth() {
  const baseUrl = process.env.BACKEND_INTERNAL_URL || 'https://backend-production-c094.up.railway.app';
  const apiKey = process.env.AGENT_API_KEY || '908c54618eadf3cf14a03e4636df7bf4252344908ec554f6abf410219b4034f4';
  
  console.log('🔍 Testing Authentication');
  console.log('Backend URL:', baseUrl);
  console.log('API Key (first 16 chars):', apiKey.substring(0, 16) + '...');
  console.log('API Key length:', apiKey.length);
  console.log('');

  // Test 1: Basic endpoint with API key
  try {
    console.log('📡 Test 1: GET /api/projects with x-agent-token header');
    const response = await fetch(`${baseUrl}/api/projects?limit=1`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': apiKey,
        'User-Agent': 'debug-test'
      }
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response body:', text);
    console.log('');
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message);
    console.log('');
  }

  // Test 2: Try with x-api-key header instead
  try {
    console.log('📡 Test 2: GET /api/projects with x-api-key header');
    const response = await fetch(`${baseUrl}/api/projects?limit=1`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'User-Agent': 'debug-test'
      }
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response body:', text);
    console.log('');
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message);
    console.log('');
  }

  // Test 3: Check if backend is responding at all
  try {
    console.log('📡 Test 3: GET /api/health (no auth)');
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'debug-test'
      }
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response body:', text);
    console.log('');
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message);
    console.log('');
  }

  // Test 4: Try a simple authenticated endpoint
  try {
    console.log('📡 Test 4: GET /api/auth/api-keys (should work with API key)');
    const response = await fetch(`${baseUrl}/api/auth/api-keys`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': apiKey,
        'User-Agent': 'debug-test'
      }
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response body:', text);
    console.log('');
  } catch (error) {
    console.error('❌ Test 4 failed:', error.message);
    console.log('');
  }

  // Test 4: Check API key format
  console.log('🔍 API Key Analysis:');
  console.log('Full key:', apiKey);
  console.log('Key prefix (first 8 chars):', apiKey.substring(0, 8));
  console.log('Contains backslash:', apiKey.includes('\\'));
  console.log('Contains quotes:', apiKey.includes('"') || apiKey.includes("'"));
}

testAuth().catch(console.error);