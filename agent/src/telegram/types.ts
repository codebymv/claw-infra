/**
 * Core Telegram Bot API types and interfaces
 */

// ── Telegram API Types ──

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  date: number;
  chat: TelegramChat;
  text?: string;
  entities?: TelegramMessageEntity[];
  reply_to_message?: TelegramMessage;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  errorCode?: number;
}

// ── Bot Command Types ──

export interface BotCommand {
  command: string;
  description: string;
}

export interface SetMyCommandsParams {
  commands: BotCommand[];
  scope?: BotCommandScope;
  language_code?: string;
}

export interface BotCommandScope {
  type: 'default' | 'all_private_chats' | 'all_group_chats' | 'all_chat_administrators' | 'chat' | 'chat_administrators' | 'chat_member';
  chat_id?: number | string;
  user_id?: number;
}

// ── Message Options ──

export interface MessageOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  replyMarkup?: InlineKeyboard | ReplyKeyboard;
  disablePreview?: boolean;
  disableNotification?: boolean;
  replyToMessageId?: number;
}

export interface CallbackOptions {
  text?: string;
  showAlert?: boolean;
  url?: string;
  cacheTime?: number;
}

// ── Keyboard Types ──

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  login_url?: LoginUrl;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  callback_game?: any;
  pay?: boolean;
}

export interface ReplyKeyboard {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
}

export interface KeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
  request_poll?: KeyboardButtonPollType;
}

export interface KeyboardButtonPollType {
  type?: 'quiz' | 'regular';
}

export interface LoginUrl {
  url: string;
  forward_text?: string;
  bot_username?: string;
  request_write_access?: boolean;
}

// ── Error Types ──

export interface TelegramError extends Error {
  code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
    migrate_to_chat_id?: number;
  };
}