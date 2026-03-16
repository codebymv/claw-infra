/**
 * Integration layer for Telegram Bot Commands with ZeroClaw
 * This replaces ZeroClaw's native Telegram channel with enhanced bot commands
 */

import { createTelegramBotCommands, TelegramBotCommands } from './telegram';
import { getProjectClient } from './project-client';
import { contextualCommands } from './contextual-commands';
import { spawn } from 'child_process';

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

    // Create bot instance with proper user allowlist handling
    const allowedUsersEnv = process.env.ZEROCLAW_TELEGRAM_ALLOWED_USERS;
    let allowedUsers: string[] = ['*']; // Default to allow all users
    
    if (allowedUsersEnv && allowedUsersEnv.trim()) {
      // Check if it's a placeholder value and treat as wildcard
      if (allowedUsersEnv.trim() === 'your_telegram_user_id' || allowedUsersEnv.trim() === 'rusty_chain') {
        allowedUsers = ['*']; // Treat placeholder/test values as allow all
        console.log('[telegram-integration] Using wildcard access (placeholder/test value detected)');
      } else {
        // Only use specific users if the env var is set to real values
        allowedUsers = allowedUsersEnv.split(',').map(u => u.trim()).filter(Boolean);
        if (allowedUsers.length === 0) {
          allowedUsers = ['*']; // Fallback to allow all if parsing results in empty array
        }
      }
    }
    
    console.log(`[telegram-integration] Allowed users: ${allowedUsers.join(', ')}`);
    
    telegramBot = createTelegramBotCommands({
      botToken,
      allowedUsers,
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
 * Execute a ZeroClaw tool/command and return the result
 */
async function executeZeroClawCommand(command: string, userId: string, chatId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // For project-related commands, use our contextual commands
    if (command.startsWith('/projects') || command === 'projects') {
      handleProjectsCommand(userId, chatId).then(resolve).catch(reject);
      return;
    }

    // For other commands, execute them through ZeroClaw's tool system
    const child = spawn('zeroclaw', ['run', command], {
      env: {
        ...process.env,
        ZEROCLAW_CHANNEL: 'api',
        ZEROCLAW_USER_ID: userId,
        ZEROCLAW_CHAT_ID: chatId
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000 // 30 second timeout
    });

    let output = '';
    let error = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim() || 'Command executed successfully');
      } else {
        reject(new Error(error.trim() || `Command failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });

    // Send the command to stdin
    child.stdin?.write(command + '\n');
    child.stdin?.end();
  });
}

/**
 * Handle the /projects command with our enhanced UI
 */
export async function handleProjectsCommand(userId: string, chatId: string): Promise<string> {
  try {
    const projectClient = getProjectClient();
    const projects = await projectClient.listProjects({ limit: 10 });

    if (projects.length === 0) {
      return `📋 **No Projects Found**

You don't have any projects yet. Create your first project:

**Quick Start:**
• \`create project "My First Project"\` - Create a basic project
• \`create project "Website Redesign" template software\` - Create with template

🔗 Or visit the web interface to create projects with more options.`;
    }

    let response = `📋 **Your Projects** (${projects.length} total)\n\n`;

    projects.forEach((project: any, index: number) => {
      const statusEmoji = project.status === 'active' ? '🟢' : '🟡';
      const cardCount = project.cardCount || 0;
      
      response += `${index + 1}. ${statusEmoji} **${project.name}**\n`;
      response += `   📝 ${project.description || 'No description'}\n`;
      response += `   📊 ${cardCount} cards • ${project.boards?.length || 0} boards\n`;
      response += `   🆔 ${project.id}\n\n`;
    });

    response += `**Quick Actions:**\n`;
    response += `• \`select project "Project Name"\` - Set active project\n`;
    response += `• \`create project "New Project"\` - Create new project\n`;
    response += `• \`show project "Project Name"\` - View project details\n`;
    response += `• \`list tasks in "Project Name"\` - Show project tasks\n\n`;
    response += `🔗 View all projects: /projects`;

    return response;

  } catch (error: any) {
    console.error('[telegram-integration] Error handling projects command:', error);
    return `❌ **Error Loading Projects**\n\nFailed to load projects: ${error.message}\n\nTry again or check the web interface.`;
  }
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
        // Use contextual commands to select project
        const result = await contextualCommands.selectProject(context.userId, context.chatId, projectId);
        
        return {
          notification: `Selected project: ${projectId}`,
          updateMessage: true,
          response: {
            text: result,
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
        const result = await handleProjectsCommand(context.userId, context.chatId);
        
        return {
          notification: 'Projects refreshed',
          updateMessage: true,
          response: {
            text: result,
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

    // Register command handlers for common ZeroClaw commands
    telegramBot.registerCallbackHandler('execute:command', async (action, context) => {
      const command = action.data.command;
      
      try {
        const result = await executeZeroClawCommand(command, context.userId, context.chatId);
        
        return {
          notification: 'Command executed',
          updateMessage: true,
          response: {
            text: result,
            parseMode: 'Markdown'
          }
        };
      } catch (error) {
        console.error('[telegram-integration] Error executing command:', error);
        return {
          notification: 'Command failed',
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