import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AlertingService, initSentry } from './common/alerting';

/**
 * CORS origins. In production this MUST be set (comma-separated) — we fail loudly
 * rather than silently falling back to a wildcard, because a permissive CORS on a
 * token-authenticated API lets any site issue authenticated requests.
 */
function allowedOrigins(): Set<string> {
  const raw = process.env.CORS_ORIGINS;
  const defaults = [
    'https://genesislunia-erp.vercel.app',
    'https://genesislumia-erp-demo.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
  ];
  if (!raw) {
    return new Set(defaults);
  }
  const parsed = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...defaults, ...parsed]);
}

async function bootstrap() {
  // Before the app is created so Sentry can instrument startup errors too (no-op without SENTRY_DSN).
  if (initSentry()) Logger.log('Sentry error reporting enabled', 'Bootstrap');
  // rawBody: payment webhooks verify an HMAC over the exact bytes the provider sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Admission documents (max 5 MB) travel base64-encoded inside JSON (~6.7 MB on the
  // wire). Nest's default 100 KB limit rejected every real scan with 413.
  app.useBodyParser('json', { limit: '8mb' });
  // Behind nginx / a load balancer every request arrives from the proxy's IP, so the
  // per-IP rate limits would throttle the whole school as one client. TRUST_PROXY=1
  // (number of proxy hops) makes Express use the real client IP from X-Forwarded-For.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
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
  // 5xx → Sentry (SENTRY_DSN) + de-duplicated ALERT_WEBHOOK_URL post.
  app.useGlobalFilters(new AllExceptionsFilter(app.get(AlertingService)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // API docs are a map of every endpoint — useful in dev, reconnaissance in production.
  const swaggerOn = !isProd || process.env.SWAGGER_ENABLED === '1';
  if (swaggerOn) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Genesis ERP API')
      .setDescription('NestJS + Prisma backend for Genesis ERP')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`🚀 Backend running on http://localhost:${port}/api`, 'Bootstrap');
  if (swaggerOn) Logger.log(`📘 Swagger docs at http://localhost:${port}/api/docs`, 'Bootstrap');
}
void bootstrap();