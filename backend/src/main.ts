import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IpAllowlistGuard } from './common/guards/ip-allowlist.guard';
import { validateStartupEnv } from './config/env.validation';

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

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Run database migrations before starting the server
  const dataSource = app.get(DataSource);
  try {
    console.log('Running database migrations...');
    const migrations = await dataSource.runMigrations({ transaction: 'all' });
    if (migrations.length > 0) {
      console.log(`Applied ${migrations.length} migration(s):`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    } else {
      console.log('No pending migrations');
    }
  } catch (error) {
    console.error('Migration failed:', error);
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
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);

      // Explicitly allow configured production origins
      if (allowedOrigins.has(origin)) return callback(null, true);

      // Allow localhost only outside production
      if (!isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin))
        return callback(null, true);

      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  const port = config.get<string>('PORT') || 3000;
  await app.listen(port);
  console.log(`Backend listening on port ${port}`);

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);

    const shutdownTimeout = setTimeout(() => {
      console.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      await app.close();
      clearTimeout(shutdownTimeout);
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap();
