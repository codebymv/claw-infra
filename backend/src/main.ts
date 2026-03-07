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
  const app = await NestFactory.create(AppModule);
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

  app.enableCors({
    origin: config.get<string>('FRONTEND_URL') || 'http://localhost:3001',
    credentials: true,
  });

  const port = config.get<string>('PORT') || 3000;
  await app.listen(port);
  console.log(`Backend listening on port ${port}`);
}

bootstrap();
