import { Injectable, LoggerService, Scope } from '@nestjs/common';

export interface LogContext {
  requestId?: string;
  runId?: string;
  userId?: string;
  agentName?: string;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLogger implements LoggerService {
  private context: LogContext = {};

  constructor(private readonly defaultContext?: string) {}

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private write(
    level: StructuredLogEntry['level'],
    event: string,
    message: string,
    error?: Error,
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event: this.defaultContext ? `${this.defaultContext}.${event}` : event,
      message,
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    // Output as JSON for structured logging
    console.log(JSON.stringify(entry));
  }

  log(message: string, event = 'log'): void {
    this.write('info', event, message);
  }

  info(message: string, event = 'info'): void {
    this.write('info', event, message);
  }

  debug(message: string, event = 'debug'): void {
    this.write('debug', event, message);
  }

  warn(message: string, event = 'warn'): void {
    this.write('warn', event, message);
  }

  error(message: string, error?: Error, event = 'error'): void {
    this.write('error', event, message, error);
  }

  // Compatibility with NestJS LoggerService interface
  verbose(message: string): void {
    this.debug(message, 'verbose');
  }

  fatal(message: string, error?: Error): void {
    this.error(message, error, 'fatal');
  }
}

// Factory function for creating loggers with context
export function createLogger(context: string): StructuredLogger {
  return new StructuredLogger(context);
}
