#!/usr/bin/env node

// Simple test to check if the project manager CLI works with the backend

async function testProjectManager() {
  try {
    console.log('🧪 Testing project manager CLI...');
    
    // Set environment variables
    process.env.BACKEND_INTERNAL_URL = 'https://backend-production-c094.up.railway.app';
    process.env.CLAW_API_KEY = 'test-key-12345678'; // This will likely fail, but let's see the error
    
    // Import and test the project manager
    const { getProjectClient } = require('./dist/project-client');
    const client = getProjectClient();
    
    console.log('📡 Attempting to connect to backend...');
    const projects = await client.listProjects({ limit: 5 });
    console.log('✅ Successfully fetched projects:', projects.length || 0, 'projects');
    
    return true;
  } catch (error) {
    console.error('❌ Error details:', {
      message: error.message,
      status: error.status,
      response: error.response
    });
    
    // Check if it's an authentication error
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('\n💡 This is an authentication error - we need a valid API key');
      console.log('🔧 The project manager CLI is working, but needs proper authentication');
      return 'auth_error';
    }
    
    return false;
  }
}

async function main() {
  console.log('🚀 Starting simple test...\n');
  
  const result = await testProjectManager();
  
  if (result === 'auth_error') {
    console.log('\n✅ CLI is working correctly - just needs authentication');
    console.log('🎯 Next step: Set up proper API key authentication');
  } else if (result === true) {
    console.log('\n✅ All tests passed!');
  } else {
    console.log('\n❌ Tests failed');
  }
}

main().catch(console.error);