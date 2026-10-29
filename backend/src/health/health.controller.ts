import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Liveness + readiness for load balancers and uptime monitors. Public on purpose,
 * reveals nothing but up/down, DB latency, redis up/down (only when REDIS_URL is set)
 * and version. Redis down = 503: rate limits and the shared cache depend on it.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    // 503s are set directly (not thrown) so the body survives the global exception
    // filter and a down dependency doesn't page the 5xx alert channel on every probe.
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'down', db: 'unreachable' };
    }
    const dbMs = Date.now() - started;
    const redis = await this.redis.health();
    const body = {
      status: redis === 'down' ? 'degraded' : 'ok',
      db: 'ok',
      db_ms: dbMs,
      ...(redis ? { redis } : {}),
      uptime_s: Math.round(process.uptime()),
      version: process.env.APP_VERSION ?? 'dev',
    };
    if (redis === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
