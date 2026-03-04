import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.botToken = config.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = config.get<string>('TELEGRAM_CHAT_ID');
    this.enabled = !!(this.botToken && this.chatId);

    if (this.enabled) {
      this.logger.log('Telegram alerts enabled');
    } else {
      this.logger.warn('Telegram alerts disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    }
  }

  async send(message: string): Promise<void> {
    if (!this.enabled) return;

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Telegram API error ${res.status}: ${body}`);
      }
    } catch (err) {
      this.logger.error(`Telegram send failed: ${(err as Error).message}`);
    }
  }
}
