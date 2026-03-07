import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppGateway } from './app.gateway';
import { PubSubService } from './pubsub.service';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, AuthModule, TypeOrmModule],
  controllers: [HealthController],
  providers: [AppGateway, PubSubService],
  exports: [PubSubService, AppGateway],
})
export class WsModule {}
