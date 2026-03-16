/**
 * Integration layer for Telegram Bot Commands with ZeroClaw
 */

import { createTelegramBotCommands, TelegramBotCommands } from './telegram';
import { getProjectClient } from './project-client';

let telegramBot: TelegramBotCommands | null = null;

/**
 * Initialize Telegram Bot Commands integration
 */
export async function initializeTelegramBotCommands(): Promise<void> {
  const botToken = process.env.ZEROCLAW_TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.log('[telegram-integration] No bot token found, skipping Telegram bot commands initialization');
    return;
  }

  try {
    console.log('[telegram-integration] Initializing enhanced Telegram bot commands...');

    // Create bot instance
    telegramBot = createTelegramBotCommands({
      botToken,
      allowedUsers: process.env.ZEROCLAW_TELEGRAM_ALLOWED_USERS?.split(',').map(u => u.trim()).filter(Boolean),
      enableLogging: process.env.NODE_ENV !== 'production'
    });

    // Initialize the bot
    if (telegramBot) {
      await telegramBot.initialize();
    }

    // Register project management integrations after initialization
    await registerProjectIntegrations();

    console.log('[telegram-integration] Enhanced Telegram bot commands initialized successfully');

  } catch (error) {
    console.error('[telegram-integration] Failed to initialize Telegram bot commands:', error);
    telegramBot = null;
    throw error;
  }
}

/**
 * Shutdown Telegram Bot Commands
 */
export async function shutdownTelegramBotCommands(): Promise<void> {
  if (telegramBot) {
    try {
      await telegramBot.shutdown();
      console.log('[telegram-integration] Telegram bot commands shutdown completed');
    } catch (error) {
      console.error('[telegram-integration] Error during Telegram bot shutdown:', error);
    }
    telegramBot = null;
  }
}

/**
 * Get the Telegram bot instance (for external integrations)
 */
export function getTelegramBot(): TelegramBotCommands | null {
  return telegramBot;
}

/**
 * Register project management integrations with the bot
 */
async function registerProjectIntegrations(): Promise<void> {
  if (!telegramBot) {
    return;
  }

  try {
    const projectClient = getProjectClient();
    
    // Register custom callback handlers for project operations
    telegramBot.registerCallbackHandler('select:project', async (action, context) => {
      const projectId = action.data.value || action.data.projectId;
      
      try {
        // TODO: Use actual project client to get project details
        // const project = await projectClient.getProject(projectId);
        
        // For now, return success with mock data
        return {
          notification: `Selected project: ${projectId}`,
          updateMessage: true,
          response: {
            text: `🎯 **Project Selected**\n\nProject ${projectId} is now active. You can now use project-specific commands.`,
            parseMode: 'Markdown'
          }
        };
      } catch (error) {
        console.error('[telegram-integration] Error selecting project:', error);
        return {
          notification: 'Failed to select project',
          updateMessage: false
        };
      }
    });

    // Register projects list handler
    telegramBot.registerCallbackHandler('projects:refresh', async (action, context) => {
      try {
        // TODO: Use actual project client to refresh projects
        // const projects = await projectClient.listProjects();
        
        const uiGenerator = telegramBot!.getUIGenerator();
        
        // For now, return mock refresh
        return {
          notification: 'Projects refreshed',
          updateMessage: true,
          response: {
            text: '🔄 **Projects Refreshed**\n\nProject list has been updated.',
            parseMode: 'Markdown'
          }
        };
      } catch (error) {
        console.error('[telegram-integration] Error refreshing projects:', error);
        return {
          notification: 'Failed to refresh projects',
          updateMessage: false
        };
      }
    });

    console.log('[telegram-integration] Project management integrations registered');

  } catch (error) {
    console.warn('[telegram-integration] Failed to register project integrations:', error);
  }
}

/**
 * Process incoming Telegram webhook (for webhook mode)
 */
export async function processTelegramWebhook(update: any): Promise<void> {
  if (!telegramBot) {
    console.warn('[telegram-integration] Received webhook but bot not initialized');
    return;
  }

  try {
    await telegramBot.processUpdate(update);
  } catch (error) {
    console.error('[telegram-integration] Error processing webhook:', error);
  }
}

/**
 * Get bot status information
 */
export function getTelegramBotStatus(): { enabled: boolean; initialized: boolean; userCount?: number } {
  if (!telegramBot) {
    return { enabled: false, initialized: false };
  }

  const info = telegramBot.getBotInfo();
  return {
    enabled: true,
    initialized: info.initialized,
    userCount: info.userCount
  };
}