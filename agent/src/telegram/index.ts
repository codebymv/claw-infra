/**
 * Telegram Bot Commands - Enhanced ZeroClaw Telegram Integration
 * 
 * This module provides native Telegram bot command support with:
 * - Command registration with Telegram API
 * - Interactive inline keyboards
 * - Context-aware project management
 * - Rich formatting and user experience
 * - Backward compatibility with existing commands
 */

// Main orchestrator
export {
  TelegramBotCommands,
  TelegramBotCommandsConfig
} from './telegram-bot-commands';

// Core components
export {
  TelegramBotHandler,
  ITelegramBotHandler
} from './telegram-bot-handler';

export {
  CommandRegistry,
  ICommandRegistry
} from './command-registry';

export {
  UIResponseGenerator,
  IUIResponseGenerator
} from './ui-response-generator';

export {
  CallbackHandler,
  ICallbackHandler
} from './callback-handler';

export {
  CommandParser,
  ICommandParser
} from './command-parser';

export {
  CommandHandler,
  ICommandHandler
} from './command-handler';

// Types and models
export * from './types';
export * from './models';

// Utility function for easy integration
import { TelegramBotCommands } from './telegram-bot-commands';

export function createTelegramBotCommands(config: {
  botToken: string;
  webhookUrl?: string;
  allowedUsers?: string[];
  enableLogging?: boolean;
}): TelegramBotCommands {
  return new TelegramBotCommands(config);
}