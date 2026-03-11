import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecord } from '../database/entities/idempotency-record.entity';
import { IdempotencyService } from './services/idempotency.service';
import { ClientErrorsController } from './controllers/client-errors.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  controllers: [ClientErrorsController],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class CommonModule {}
