import { Controller, Post, Body, Logger } from '@nestjs/common';
import { IsString, IsObject, IsOptional } from 'class-validator';

class ClientErrorDto {
  @IsString()
  componentName: string;

  @IsObject()
  error: {
    message: string;
    stack?: string;
    name: string;
  };

  @IsObject()
  @IsOptional()
  errorInfo?: {
    componentStack?: string;
  };

  @IsString()
  @IsOptional()
  userAgent?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  timestamp?: string;
}

@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger('ClientErrors');

  @Post()
  async logClientError(@Body() dto: ClientErrorDto) {
    // Log structured error for monitoring/alerting
    this.logger.error({
      event: 'client_error',
      component: dto.componentName,
      error: dto.error.message,
      stack: dto.error.stack,
      errorName: dto.error.name,
      componentStack: dto.errorInfo?.componentStack,
      userAgent: dto.userAgent,
      url: dto.url,
      timestamp: dto.timestamp,
    });

    return { success: true, message: 'Error logged successfully' };
  }
}
