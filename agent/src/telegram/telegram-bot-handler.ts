import { EventEmitter } from 'events';
import {
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramUpdate,
  TelegramApiResponse,
  MessageOptions,
  CallbackOptions,
  SetMyCommandsParams,
  BotCommand
} from './types';

/**
 * Telegram Bot Handler interface for message routing and API communication
 */
export interface ITelegramBotHandler {
  // Core bot management
  initialize(botToken: string, webhookUrl?: string): Promise<void>;
  shutdown(): Promise<void>;
  
  // Message handling
  handleMessage(message: TelegramMessage): Promise<void>;
  handleCallbackQuery(query: TelegramCallbackQuery): Promise<void>;
  
  // Response methods
  sendMessage(chatId: string | number, text: string, options?: MessageOptions): Promise<void>;
  editMessage(chatId: string | number, messageId: number, text: string, options?: MessageOptions): Promise<void>;
  answerCallbackQuery(queryId: string, options?: CallbackOptions): Promise<void>;
  
  // Command registration
  setMyCommands(commands: BotCommand[], scope?: SetMyCommandsParams['scope']): Promise<void>;
  
  // Event emitter interface
  on(event: 'message', listener: (message: TelegramMessage) => void): this;
  on(event: 'callback_query', listener: (query: TelegramCallbackQuery) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  retryAfterMs: number;
}

/**
 * Telegram Bot Handler implementation
 */
export class TelegramBotHandler extends EventEmitter implements ITelegramBotHandler {
  private botToken: string | null = null;
  private baseUrl: string = 'https://api.telegram.org/bot';
  private isInitialized: boolean = false;
  private rateLimitConfig: RateLimitConfig = {
    maxRequestsPerSecond: 30,
    maxRequestsPerMinute: 20,
    retryAfterMs: 1000
  };
  
  // Rate limiting state
  private requestsThisSecond: number = 0;
  private requestsThisMinute: number = 0;
  private lastSecondReset: number = Date.now();
  private lastMinuteReset: number = Date.now();

  constructor() {
    super();
  }

  async initialize(botToken: string, webhookUrl?: string): Promise<void> {
    if (!botToken) {
      throw new Error('Bot token is required for Telegram Bot Handler initialization');
    }

    this.botToken = botToken;
    
    try {
      // Test the bot token by calling getMe
      const response = await this.makeApiCall<any>('getMe');
      if (!response.ok) {
        throw new Error(`Invalid bot token: ${response.description}`);
      }

      console.log(`[telegram-bot] Initialized bot: ${response.result.username} (${response.result.first_name})`);
      
      // Set up webhook if provided
      if (webhookUrl) {
        await this.setWebhook(webhookUrl);
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Telegram bot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.isInitialized) {
      try {
        // Remove webhook
        await this.makeApiCall('deleteWebhook');
        console.log('[telegram-bot] Bot shutdown completed');
      } catch (error) {
        console.warn('[telegram-bot] Error during shutdown:', error);
      }
    }
    
    this.isInitialized = false;
    this.botToken = null;
    this.removeAllListeners();
  }

  async handleMessage(message: TelegramMessage): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot handler not initialized');
    }

    try {
      this.emit('message', message);
    } catch (error) {
      console.error('[telegram-bot] Error handling message:', error);
      this.emit('error', error instanceof Error ? error : new Error('Unknown message handling error'));
    }
  }

  async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot handler not initialized');
    }

    try {
      this.emit('callback_query', query);
    } catch (error) {
      console.error('[telegram-bot] Error handling callback query:', error);
      this.emit('error', error instanceof Error ? error : new Error('Unknown callback handling error'));
    }
  }

  async sendMessage(chatId: string | number, text: string, options: MessageOptions = {}): Promise<void> {
    if (!this.isInitialized || !this.botToken) {
      throw new Error('Bot handler not initialized');
    }

    const params: any = {
      chat_id: chatId,
      text: text
    };

    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }

    if (options.replyMarkup) {
      params.reply_markup = JSON.stringify(options.replyMarkup);
    }

    if (options.disablePreview) {
      params.disable_web_page_preview = true;
    }

    if (options.disableNotification) {
      params.disable_notification = true;
    }

    try {
      const response = await this.makeApiCall<any>('sendMessage', params);
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.description}`);
      }
    } catch (error) {
      console.error('[telegram-bot] Error sending message:', error);
      throw error;
    }
  }

  async editMessage(chatId: string | number, messageId: number, text: string, options: MessageOptions = {}): Promise<void> {
    if (!this.isInitialized || !this.botToken) {
      throw new Error('Bot handler not initialized');
    }

    const params: any = {
      chat_id: chatId,
      message_id: messageId,
      text: text
    };

    if (options.parseMode) {
      params.parse_mode = options.parseMode;
    }

    if (options.replyMarkup) {
      params.reply_markup = JSON.stringify(options.replyMarkup);
    }

    try {
      const response = await this.makeApiCall<any>('editMessageText', params);
      if (!response.ok) {
        throw new Error(`Failed to edit message: ${response.description}`);
      }
    } catch (error) {
      console.error('[telegram-bot] Error editing message:', error);
      throw error;
    }
  }

  async answerCallbackQuery(queryId: string, options: CallbackOptions = {}): Promise<void> {
    if (!this.isInitialized || !this.botToken) {
      throw new Error('Bot handler not initialized');
    }

    const params: any = {
      callback_query_id: queryId
    };

    if (options.text) {
      params.text = options.text;
    }

    if (options.showAlert) {
      params.show_alert = true;
    }

    if (options.url) {
      params.url = options.url;
    }

    if (options.cacheTime !== undefined) {
      params.cache_time = options.cacheTime;
    }

    try {
      const response = await this.makeApiCall<any>('answerCallbackQuery', params);
      if (!response.ok) {
        throw new Error(`Failed to answer callback query: ${response.description}`);
      }
    } catch (error) {
      console.error('[telegram-bot] Error answering callback query:', error);
      throw error;
    }
  }

  async setMyCommands(commands: BotCommand[], scope?: SetMyCommandsParams['scope']): Promise<void> {
    if (!this.isInitialized || !this.botToken) {
      throw new Error('Bot handler not initialized');
    }

    const params: any = {
      commands: commands
    };

    if (scope) {
      params.scope = JSON.stringify(scope);
    }

    try {
      const response = await this.makeApiCall<any>('setMyCommands', params);
      if (!response.ok) {
        throw new Error(`Failed to set bot commands: ${response.description}`);
      }
      
      console.log(`[telegram-bot] Registered ${commands.length} commands with Telegram`);
    } catch (error) {
      console.error('[telegram-bot] Error setting bot commands:', error);
      throw error;
    }
  }

  private async setWebhook(webhookUrl: string): Promise<void> {
    const params = {
      url: webhookUrl
    };

    const response = await this.makeApiCall<any>('setWebhook', params);
    if (!response.ok) {
      throw new Error(`Failed to set webhook: ${response.description}`);
    }

    console.log(`[telegram-bot] Webhook set to: ${webhookUrl}`);
  }

  private async makeApiCall<T>(method: string, params: any = {}): Promise<TelegramApiResponse<T>> {
    if (!this.botToken) {
      throw new Error('Bot token not available');
    }

    // Apply rate limiting
    await this.applyRateLimit();

    const url = `${this.baseUrl}${this.botToken}/${method}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const data = await response.json() as TelegramApiResponse<T>;
      
      // Handle rate limiting response
      if (!data.ok && data.errorCode === 429) {
        const retryAfter = parseInt(data.description?.match(/retry after (\d+)/)?.[1] || '60') * 1000;
        console.warn(`[telegram-bot] Rate limited, retrying after ${retryAfter}ms`);
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        return this.makeApiCall<T>(method, params);
      }

      return data;
    } catch (error) {
      console.error(`[telegram-bot] API call failed for ${method}:`, error);
      throw error;
    }
  }

  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset counters if needed
    if (now - this.lastSecondReset >= 1000) {
      this.requestsThisSecond = 0;
      this.lastSecondReset = now;
    }
    
    if (now - this.lastMinuteReset >= 60000) {
      this.requestsThisMinute = 0;
      this.lastMinuteReset = now;
    }
    
    // Check rate limits
    if (this.requestsThisSecond >= this.rateLimitConfig.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - this.lastSecondReset);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    if (this.requestsThisMinute >= this.rateLimitConfig.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.lastMinuteReset);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Increment counters
    this.requestsThisSecond++;
    this.requestsThisMinute++;
  }
}