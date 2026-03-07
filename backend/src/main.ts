import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IpAllowlistGuard } from './common/guards/ip-allowlist.guard';
import { validateStartupEnv } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  validateStartupEnv(config);

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
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow the configured frontend URL
      if (frontendUrl && origin === frontendUrl) return callback(null, true);
      // Allow any Railway app subdomain
      if (origin.endsWith('.up.railway.app')) return callback(null, true);
      // Allow localhost for development
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  const port = config.get<string>('PORT') || 3000;
  await app.listen(port);
  console.log(`Backend listening on port ${port}`);
}

bootstrap();
