import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, origin?: boolean | string) => void) => {
      if (!origin) return cb(null, true);
      if (
        origin.startsWith('http://localhost') ||
        origin.endsWith('.pages.dev') ||
        origin.includes('vercel.app') ||
        origin.includes('netlify.app')
      ) {
        return cb(null, true);
      }
      return cb(null, true); // permissive by default; tighten for production
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
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
bootstrap();
