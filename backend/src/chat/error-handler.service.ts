import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Socket } from 'socket.io';

export enum ChatErrorCode {
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  
  // Connection errors
  CONNECTION_LOST = 'CONNECTION_LOST',
  RECONNECTION_FAILED = 'RECONNECTION_FAILED',
  WEBSOCKET_ERROR = 'WEBSOCKET_ERROR',
  
  // Message errors
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  INVALID_MESSAGE_FORMAT = 'INVALID_MESSAGE_FORMAT',
  
  // Command errors
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  COMMAND_EXECUTION_FAILED = 'COMMAND_EXECUTION_FAILED',
  INVALID_COMMAND_SYNTAX = 'INVALID_COMMAND_SYNTAX',
  
  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_LIMIT_EXCEEDED = 'SESSION_LIMIT_EXCEEDED',
  SESSION_RECOVERY_FAILED = 'SESSION_RECOVERY_FAILED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // System errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ChatError {
  code: ChatErrorCode;
  message: string;
  details?: any;
  timestamp: Date;
  recoverable: boolean;
  retryAfter?: number;
}

@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);
  private readonly errorCounts = new Map<string, number>();
  private readonly MAX_ERRORS_PER_USER = 10;
  private readonly ERROR_RESET_INTERVAL_MS = 60000; // 1 minute

  /**
   * Create a standardized chat error
   */
  createError(
    code: ChatErrorCode,
    message: string,
    details?: any,
    recoverable: boolean = true,
    retryAfter?: number,
  ): ChatError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      recoverable,
      retryAfter,
    };
  }

  /**
   * Handle WebSocket errors
   */
  handleWebSocketError(
    client: Socket,
    error: any,
    context?: string,
  ): void {
    const userId = (client as any).userId;
    
    this.logger.error(
      `WebSocket error for client ${client.id} (user: ${userId})${context ? ` in ${context}` : ''}: ${error.message}`,
      error.stack,
    );

    const chatError = this.mapErrorToChatError(error);
    
    client.emit('error', {
      ...chatError,
      context,
    });

    // Track error count
    if (userId) {
      this.incrementErrorCount(userId);
    }
  }

  /**
   * Handle REST API errors
   */
  handleRestError(error: any, context?: string): HttpException {
    this.logger.error(
      `REST API error${context ? ` in ${context}` : ''}: ${error.message}`,
      error.stack,
    );

    const chatError = this.mapErrorToChatError(error);
    
    return new HttpException(
      {
        ...chatError,
        context,
      },
      this.getHttpStatus(chatError.code),
    );
  }

  /**
   * Map generic errors to chat errors
   */
  private mapErrorToChatError(error: any): ChatError {
    // Database errors
    if (error.name === 'QueryFailedError' || error.code?.startsWith('23')) {
      return this.createError(
        ChatErrorCode.DATABASE_ERROR,
        'Database operation failed',
        { originalError: error.message },
        true,
        5000,
      );
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return this.createError(
        ChatErrorCode.AUTH_FAILED,
        'Authentication failed',
        { reason: error.message },
        false,
      );
    }

    // Validation errors
    if (error.name === 'ValidationError') {
      return this.createError(
        ChatErrorCode.INVALID_MESSAGE_FORMAT,
        'Invalid input format',
        { errors: error.errors },
        true,
      );
    }

    // Rate limit errors
    if (error.message?.includes('rate limit')) {
      return this.createError(
        ChatErrorCode.RATE_LIMIT_EXCEEDED,
        'Too many requests',
        null,
        true,
        60000,
      );
    }

    // Default internal error
    return this.createError(
      ChatErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      { originalError: error.message },
      true,
      5000,
    );
  }

  /**
   * Get HTTP status code for error
   */
  private getHttpStatus(code: ChatErrorCode): number {
    const statusMap: Record<ChatErrorCode, number> = {
      [ChatErrorCode.AUTH_FAILED]: HttpStatus.UNAUTHORIZED,
      [ChatErrorCode.SESSION_EXPIRED]: HttpStatus.UNAUTHORIZED,
      [ChatErrorCode.UNAUTHORIZED]: HttpStatus.FORBIDDEN,
      [ChatErrorCode.SESSION_NOT_FOUND]: HttpStatus.NOT_FOUND,
      [ChatErrorCode.COMMAND_NOT_FOUND]: HttpStatus.NOT_FOUND,
      [ChatErrorCode.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
      [ChatErrorCode.MESSAGE_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
      [ChatErrorCode.INVALID_MESSAGE_FORMAT]: HttpStatus.BAD_REQUEST,
      [ChatErrorCode.INVALID_COMMAND_SYNTAX]: HttpStatus.BAD_REQUEST,
      [ChatErrorCode.DATABASE_ERROR]: HttpStatus.SERVICE_UNAVAILABLE,
      [ChatErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ChatErrorCode.CONNECTION_LOST]: HttpStatus.SERVICE_UNAVAILABLE,
      [ChatErrorCode.RECONNECTION_FAILED]: HttpStatus.SERVICE_UNAVAILABLE,
      [ChatErrorCode.WEBSOCKET_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ChatErrorCode.MESSAGE_SEND_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ChatErrorCode.COMMAND_EXECUTION_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ChatErrorCode.SESSION_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
      [ChatErrorCode.SESSION_RECOVERY_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
    };

    return statusMap[code] || HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Track error counts per user
   */
  private incrementErrorCount(userId: string): void {
    const currentCount = this.errorCounts.get(userId) || 0;
    const newCount = currentCount + 1;
    
    this.errorCounts.set(userId, newCount);

    if (newCount >= this.MAX_ERRORS_PER_USER) {
      this.logger.warn(`User ${userId} has exceeded error threshold (${newCount} errors)`);
    }

    // Reset after interval
    setTimeout(() => {
      const count = this.errorCounts.get(userId);
      if (count && count > 0) {
        this.errorCounts.set(userId, count - 1);
      }
    }, this.ERROR_RESET_INTERVAL_MS);
  }

  /**
   * Check if user has exceeded error threshold
   */
  hasExceededErrorThreshold(userId: string): boolean {
    const count = this.errorCounts.get(userId) || 0;
    return count >= this.MAX_ERRORS_PER_USER;
  }

  /**
   * Get error count for user
   */
  getErrorCount(userId: string): number {
    return this.errorCounts.get(userId) || 0;
  }

  /**
   * Reset error count for user
   */
  resetErrorCount(userId: string): void {
    this.errorCounts.delete(userId);
    this.logger.log(`Reset error count for user ${userId}`);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalUsers: number;
    usersWithErrors: number;
    averageErrorsPerUser: number;
  } {
    const usersWithErrors = this.errorCounts.size;
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);

    return {
      totalUsers: usersWithErrors,
      usersWithErrors,
      averageErrorsPerUser: usersWithErrors > 0 ? totalErrors / usersWithErrors : 0,
    };
  }
}
