#!/usr/bin/env node

// Test with dotenv to load environment variables properly
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'https://backend-production-c094.up.railway.app';

async function testWithEnvKey() {
  try {
    // Use the AGENT_API_KEY from environment
    const apiKey = process.env.AGENT_API_KEY;
    
    if (!apiKey || apiKey === 'your-agent-api-key-from-dashboard') {
      console.log('❌ AGENT_API_KEY not set or still has placeholder value');
      console.log('💡 Please update the .env file with your actual API key');
      return false;
    }

    console.log(`🔑 Testing with AGENT_API_KEY: ${apiKey.substring(0, 8)}...`);
    console.log(`🌐 Backend URL: ${BACKEND_URL}`);
    
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

async function testProjectManager() {
  try {
    console.log('\n🧪 Testing project manager with dotenv...');
    
    // Import and test the project manager
    const { getProjectClient } = require('./dist/project-client');
    const client = getProjectClient();
    
    const projects = await client.listProjects({ limit: 5 });
    console.log('✅ Project manager works!', projects);
    return true;
  } catch (error) {
    console.error('❌ Project manager failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing with dotenv configuration...\n');
  
  const authWorks = await testWithEnvKey();
  
  if (authWorks) {
    await testProjectManager();
  }
}

main().catch(console.error);