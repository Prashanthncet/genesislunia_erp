import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * CORS origins. In production this MUST be set (comma-separated) — we fail loudly
 * rather than silently falling back to a wildcard, because a permissive CORS on a
 * token-authenticated API lets any site issue authenticated requests.
 */
function allowedOrigins(): Set<string> {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    // Dev-only convenience. Never used when NODE_ENV=production.
    return new Set([
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ]);
  }
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';
  const origins = allowedOrigins();

  if (isProd && !process.env.CORS_ORIGINS) {
    Logger.error('CORS_ORIGINS is required in production. Refusing to start.', 'Bootstrap');
    process.exit(1);
  }

  // Security headers: Helmet with sensible defaults
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
            },
          }
        : false, // Swagger UI requires inline scripts in dev mode
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  // The Next.js dev server proxies /api/* server-side, so no Origin header arrives.
  // Anything WITH an Origin must be explicitly allowlisted.
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true); // same-origin / curl / server-side proxy
      if (origins.has(origin)) return cb(null, true);
      Logger.warn(`Blocked CORS origin: ${origin}`, 'Bootstrap');
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-signature'],
    maxAge: 86400,
  });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Genesis ERP API')
    .setDescription('NestJS + Prisma backend for Genesis ERP')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`🚀 Backend running on http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`📘 Swagger docs at http://localhost:${port}/api/docs`, 'Bootstrap');
}
void bootstrap();