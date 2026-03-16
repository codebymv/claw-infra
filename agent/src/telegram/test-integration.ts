/**
 * Simple test to verify Telegram Bot Commands integration
 */

import { createTelegramBotCommands } from './index';

async function testTelegramBotCommands() {
  console.log('Testing Telegram Bot Commands integration...');

  // Test with mock bot token
  const bot = createTelegramBotCommands({
    botToken: 'test-token',
    enableLogging: true
  });

  try {
    // Test component creation
    const registry = bot.getCommandRegistry();
    const uiGenerator = bot.getUIGenerator();
    
    console.log('✅ Components created successfully');
    
    // Test command registry
    const commands = registry.getRegisteredCommands();
    console.log(`✅ Found ${commands.length} registered commands`);
    
    // Test help generation
    const helpText = registry.getCommandHelp();
    console.log(`✅ Help text generated (${helpText.length} characters)`);
    
    // Test UI generation
    const mockProjects = [
      {
        id: '1',
        name: 'Test Project',
        description: 'A test project',
        status: 'active' as any,
        boardCount: 2,
        cardCount: 5,
        lastActivity: new Date(),
        isSelected: false,
        permissions: { canRead: true, canWrite: true, canDelete: false, canManage: true }
      }
    ];
    
    const projectListUI = uiGenerator.generateProjectList(mockProjects, {
      page: 1,
      limit: 5,
      hasMore: false
    });
    
    console.log(`✅ Project list UI generated (${projectListUI.text.length} characters)`);
    
    // Test context status
    const contextUI = uiGenerator.generateContextStatus(null);
    console.log(`✅ Context status UI generated (${contextUI.text.length} characters)`);
    
    console.log('\n🎉 All tests passed! Telegram Bot Commands integration is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testTelegramBotCommands().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { testTelegramBotCommands };