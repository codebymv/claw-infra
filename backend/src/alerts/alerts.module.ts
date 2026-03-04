import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { AlertsService } from './alerts.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TelegramService, AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
