#!/usr/bin/env node

// Test the project-manager CLI
const { execSync } = require('child_process');

console.log('🧪 Testing Project Manager CLI...\n');

try {
  // Test 1: Help command
  console.log('1️⃣ Testing help command...');
  const helpResult = execSync('node project-manager.js help', { encoding: 'utf8' });
  console.log('✅ Help command works');
  console.log('📋 Help output length:', helpResult.length, 'characters\n');

  // Test 2: Context command (should work without backend)
  console.log('2️⃣ Testing context command...');
  const contextResult = execSync('node project-manager.js context', { encoding: 'utf8' });
  console.log('✅ Context command works');
  console.log('📝 Context result:', contextResult.substring(0, 100) + '...\n');

  // Test 3: NLP command
  console.log('3️⃣ Testing NLP command...');
  const nlpResult = execSync('node project-manager.js nlp "show me help"', { encoding: 'utf8' });
  console.log('✅ NLP command works');
  console.log('🧠 NLP result length:', nlpResult.length, 'characters\n');

  console.log('🎉 Project Manager CLI test completed successfully!');
  console.log('\n📋 CLI is ready for ZeroClaw integration');
  console.log('🔧 ZeroClaw can now use: node /app/project-manager.js <command>');

} catch (error) {
  console.error('❌ CLI test failed:', error.message);
  process.exit(1);
}