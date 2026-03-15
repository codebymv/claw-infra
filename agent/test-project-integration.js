#!/usr/bin/env node

// Simple test script to verify project management integration
// Run with: node test-project-integration.js

const { getProjectClient } = require('./dist/project-client');
const { processNaturalLanguageCommand } = require('./dist/project-zeroclaw-tools');

async function testIntegration() {
  console.log('🧪 Testing Project Management Integration...\n');

  try {
    // Test 1: Initialize client
    console.log('1️⃣ Testing client initialization...');
    const client = getProjectClient();
    console.log('✅ Project client initialized successfully\n');

    // Test 2: Natural language processing
    console.log('2️⃣ Testing natural language processing...');
    const nlpResult = await processNaturalLanguageCommand('create project "Test Project"');
    console.log('📝 NLP Result:', nlpResult.substring(0, 100) + '...\n');

    // Test 3: Backend connectivity (if backend is running)
    console.log('3️⃣ Testing backend connectivity...');
    try {
      const projects = await client.listProjects({ limit: 1 });
      console.log('✅ Backend connection successful');
      console.log(`📋 Found ${projects.length} projects\n`);
    } catch (error) {
      console.log('⚠️ Backend not available (this is expected if backend is not running)');
      console.log(`   Error: ${error.message}\n`);
    }

    // Test 4: Tool configuration
    console.log('4️⃣ Testing tool configuration...');
    const { PROJECT_MANAGEMENT_ZEROCLAW_TOOLS } = require('./dist/zeroclaw-project-integration');
    const toolCount = Object.keys(PROJECT_MANAGEMENT_ZEROCLAW_TOOLS).length;
    console.log(`✅ ${toolCount} project management tools configured`);
    console.log('🔧 Available tools:', Object.keys(PROJECT_MANAGEMENT_ZEROCLAW_TOOLS).join(', '));

    console.log('\n🎉 Integration test completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Start the backend: npm run start:dev (in backend directory)');
    console.log('2. Start the agent: npm run start (in agent directory)');
    console.log('3. Use Telegram bot commands like: "create project \'My Project\'"');
    console.log('4. Or visit the web interface at: http://localhost:3000/projects');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run the test
testIntegration().catch(console.error);