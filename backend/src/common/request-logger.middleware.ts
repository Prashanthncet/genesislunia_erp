import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * One structured line per request (JSON in production so a log shipper can parse it):
 * request id, method, path, status, duration. Never logs bodies or auth headers.
 * Slow (>1s) and 5xx requests are logged at warn/error so alerting can key off them.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly log = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', id);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const path = req.originalUrl.split('?')[0];
      if (path === '/api/health') return;
      const entry = { id, method: req.method, path, status: res.statusCode, ms: Math.round(ms) };
      const line = process.env.NODE_ENV === 'production' ? JSON.stringify(entry) : `${entry.method} ${entry.path} ${entry.status} ${entry.ms}ms`;
      if (res.statusCode >= 500) this.log.error(line);
      else if (ms > 1000) this.log.warn(line);
      else if (process.env.NODE_ENV !== 'test') this.log.log(line);
    });
    next();
  }
}
