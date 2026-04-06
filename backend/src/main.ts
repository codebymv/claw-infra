import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IpAllowlistGuard } from './common/guards/ip-allowlist.guard';
import { validateStartupEnv } from './config/env.validation';

const logger = new Logger('Bootstrap');

function parseCsvOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  validateStartupEnv(config);

  app.enableShutdownHooks();

  const dataSource = app.get(DataSource);
  try {
    logger.log('Running database migrations...');
    const migrations = await dataSource.runMigrations({ transaction: 'none' });
    if (migrations.length > 0) {
      logger.log(`Applied ${migrations.length} migration(s):`);
      migrations.forEach((m) => logger.log(`  - ${m.name}`));
    } else {
      logger.log('No pending migrations');
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", config.get<string>('FRONTEND_URL') || ''],
              frameSrc: ["'none'"],
              objectSrc: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: isProd,
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  app.setGlobalPrefix('api');

  app.useGlobalGuards(new IpAllowlistGuard(config));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const frontendUrl = (config.get<string>('FRONTEND_URL') || '').trim();
  const additionalCorsOrigins = parseCsvOrigins(
    config.get<string>('CORS_ORIGINS'),
  );
  const allowedOrigins = new Set(
    [frontendUrl, ...additionalCorsOrigins].filter(Boolean),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) return callback(null, true);

      if (!isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin))
        return callback(null, true);

      logger.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  const port = config.get<string>('PORT') || 3000;
  await app.listen(port);
  logger.log(`Backend listening on port ${port}`);

  const gracefulShutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown...`);

    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000);

    try {
      await app.close();
      clearTimeout(shutdownTimeout);
      logger.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap();
