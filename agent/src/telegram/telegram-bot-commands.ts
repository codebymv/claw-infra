import { EventEmitter } from 'events';
import {
  TelegramBotHandler,
  ITelegramBotHandler
} from './telegram-bot-handler';
import {
  CommandRegistry,
  ICommandRegistry
} from './command-registry';
import {
  UIResponseGenerator,
  IUIResponseGenerator
} from './ui-response-generator';
import {
  CallbackHandler,
  ICallbackHandler
} from './callback-handler';
import {
  CommandParser,
  ICommandParser
} from './command-parser';
import {
  CommandHandler,
  ICommandHandler
} from './command-handler';
import {
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramUpdate
} from './types';
import {
  UserContext,
  ProjectContext,
  UserPreferences,
  SessionData
} from './models';

/**
 * Configuration for Telegram Bot Commands
 */
export interface TelegramBotCommandsConfig {
  botToken: string;
  webhookUrl?: string;
  allowedUsers?: string[];
  enableLogging?: boolean;
}

/**
 * Main Telegram Bot Commands orchestrator
 */
export class TelegramBotCommands extends EventEmitter {
  private config: TelegramBotCommandsConfig;
  private botHandler: ITelegramBotHandler;
  private commandRegistry: ICommandRegistry;
  private uiGenerator: IUIResponseGenerator;
  private callbackHandler: ICallbackHandler;
  private commandParser: ICommandParser;
  private commandHandler: ICommandHandler;
  
  // User context storage (in production, this should be persistent)
  private userContexts: Map<string, UserContext> = new Map();
  
  private isInitialized: boolean = false;

  constructor(config: TelegramBotCommandsConfig) {
    super();
    this.config = config;
    
    // Initialize components
    this.botHandler = new TelegramBotHandler();
    this.commandRegistry = new CommandRegistry(this.botHandler);
    this.uiGenerator = new UIResponseGenerator();
    this.callbackHandler = new CallbackHandler(this.uiGenerator);
    this.commandParser = new CommandParser();
    this.commandHandler = new CommandHandler(
      this.commandParser,
      this.commandRegistry,
      this.uiGenerator
    );
    
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[telegram-bot-commands] Already initialized');
      return;
    }

    try {
      console.log('[telegram-bot-commands] Initializing Telegram Bot Commands...');

      // Initialize bot handler
      await this.botHandler.initialize(this.config.botToken, this.config.webhookUrl);
      
      // Initialize command registry
      await this.commandRegistry.initialize();
      
      this.isInitialized = true;
      
      console.log('[telegram-bot-commands] Successfully initialized');
      this.emit('ready');

    } catch (error) {
      console.error('[telegram-bot-commands] Initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      console.log('[telegram-bot-commands] Shutting down...');
      
      await this.botHandler.shutdown();
      this.userContexts.clear();
      this.removeAllListeners();
      
      this.isInitialized = false;
      
      console.log('[telegram-bot-commands] Shutdown completed');

    } catch (error) {
      console.error('[telegram-bot-commands] Shutdown error:', error);
      throw error;
    }
  }

  /**
   * Process incoming Telegram update
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[telegram-bot-commands] Received update before initialization');
      return;
    }

    try {
      if (update.message) {
        await this.handleMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      console.error('[telegram-bot-commands] Error processing update:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get user context (creates if doesn't exist)
   */
  getUserContext(userId: string, chatId: string): UserContext {
    const contextKey = `${userId}:${chatId}`;
    
    if (!this.userContexts.has(contextKey)) {
      const context: UserContext = {
        userId,
        chatId,
        activeProject: undefined,
        preferences: {
          language: 'en',
          timezone: 'UTC',
          notificationsEnabled: true,
          defaultTaskPriority: 'medium' as any,
          preferredBoardView: 'kanban'
        },
        session: {
          lastActivity: new Date(),
          commandHistory: [],
          temporaryData: {}
        }
      };
      
      this.userContexts.set(contextKey, context);
    }
    
    return this.userContexts.get(contextKey)!;
  }

  /**
   * Update user context
   */
  updateUserContext(userId: string, chatId: string, updates: Partial<ProjectContext>): void {
    const context = this.getUserContext(userId, chatId);
    
    if (Object.keys(updates).length === 0) {
      // Clear active project if empty updates
      context.activeProject = undefined;
    } else if (updates) {
      // Update or create active project context
      context.activeProject = {
        ...context.activeProject,
        ...updates
      } as ProjectContext;
    }
    
    context.session.lastActivity = new Date();
  }

  // ── Private Methods ──

  private setupEventHandlers(): void {
    // Bot handler events
    this.botHandler.on('message', (message: TelegramMessage) => {
      this.handleMessage(message).catch(error => {
        console.error('[telegram-bot-commands] Message handling error:', error);
        this.emit('error', error);
      });
    });

    this.botHandler.on('callback_query', (query: TelegramCallbackQuery) => {
      this.handleCallbackQuery(query).catch(error => {
        console.error('[telegram-bot-commands] Callback query handling error:', error);
        this.emit('error', error);
      });
    });

    this.botHandler.on('error', (error: Error) => {
      console.error('[telegram-bot-commands] Bot handler error:', error);
      this.emit('error', error);
    });
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const userId = message.from?.id.toString();
    const chatId = message.chat.id.toString();
    
    if (!userId) {
      console.warn('[telegram-bot-commands] Message without user ID');
      return;
    }

    // Check if user is allowed
    if (!this.isUserAllowed(userId)) {
      await this.botHandler.sendMessage(chatId, 
        '❌ **Access Denied**\n\nYou are not authorized to use this bot.',
        { parseMode: 'Markdown' }
      );
      return;
    }

    const context = this.getUserContext(userId, chatId);
    
    try {
      const result = await this.commandHandler.handleMessage(message, context);
      
      // Update context if needed
      if (result.contextUpdate) {
        this.updateUserContext(userId, chatId, result.contextUpdate);
      }
      
      // Send response
      await this.botHandler.sendMessage(
        chatId,
        result.response.text,
        {
          parseMode: result.response.parseMode,
          replyMarkup: result.response.keyboard
        }
      );

      // Log command usage
      if (this.config.enableLogging) {
        console.log(`[telegram-bot-commands] Command executed: ${message.text} by user ${userId}`);
      }

    } catch (error) {
      console.error('[telegram-bot-commands] Command execution error:', error);
      
      await this.botHandler.sendMessage(
        chatId,
        '❌ **System Error**\n\nAn unexpected error occurred. Please try again later.',
        { parseMode: 'Markdown' }
      );
    }
  }

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const userId = query.from.id.toString();
    const chatId = query.message?.chat.id.toString();
    
    if (!chatId) {
      console.warn('[telegram-bot-commands] Callback query without chat ID');
      return;
    }

    // Check if user is allowed
    if (!this.isUserAllowed(userId)) {
      await this.botHandler.answerCallbackQuery(query.id, {
        text: 'Access denied',
        showAlert: true
      });
      return;
    }

    const context = this.getUserContext(userId, chatId);
    
    try {
      const result = await this.callbackHandler.handleCallback(query, context);
      
      // Update context if needed
      if (result.response && 'contextUpdate' in result.response) {
        this.updateUserContext(userId, chatId, (result.response as any).contextUpdate);
      }
      
      // Answer the callback query
      await this.botHandler.answerCallbackQuery(query.id, {
        text: result.notification,
        showAlert: false
      });
      
      // Update message if needed
      if (result.updateMessage && result.response && query.message) {
        await this.botHandler.editMessage(
          chatId,
          query.message.message_id,
          result.response.text,
          {
            parseMode: result.response.parseMode,
            replyMarkup: result.response.keyboard
          }
        );
      }

      // Log callback usage
      if (this.config.enableLogging) {
        console.log(`[telegram-bot-commands] Callback processed: ${query.data} by user ${userId}`);
      }

    } catch (error) {
      console.error('[telegram-bot-commands] Callback processing error:', error);
      
      await this.botHandler.answerCallbackQuery(query.id, {
        text: 'An error occurred',
        showAlert: true
      });
    }
  }

  private isUserAllowed(userId: string): boolean {
    if (!this.config.allowedUsers || this.config.allowedUsers.length === 0) {
      return true; // Allow all users if no restrictions
    }
    
    return this.config.allowedUsers.includes(userId) || this.config.allowedUsers.includes('*');
  }

  // ── Public API for Integration ──

  /**
   * Register a custom callback handler
   */
  registerCallbackHandler(pattern: string, handler: (action: any, context: UserContext) => Promise<any>): void {
    this.callbackHandler.registerCallbackHandler(pattern, handler);
  }

  /**
   * Get command registry for external integrations
   */
  getCommandRegistry(): ICommandRegistry {
    return this.commandRegistry;
  }

  /**
   * Get UI generator for external integrations
   */
  getUIGenerator(): IUIResponseGenerator {
    return this.uiGenerator;
  }

  /**
   * Send a message to a specific chat
   */
  async sendMessage(chatId: string, text: string, options?: any): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot not initialized');
    }
    
    await this.botHandler.sendMessage(chatId, text, options);
  }

  /**
   * Get bot information
   */
  getBotInfo(): { initialized: boolean; userCount: number } {
    return {
      initialized: this.isInitialized,
      userCount: this.userContexts.size
    };
  }
}