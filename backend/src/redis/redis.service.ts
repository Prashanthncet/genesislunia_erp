import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Optional shared Redis connection. REDIS_URL unset = `client` is null and every
 * consumer (report cache, rate-limit storage, alert de-duplication) falls back to its
 * in-process behaviour. One connection per app instance.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger('Redis');
  readonly client: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.client = null;
      return;
    }
    this.client = new Redis(url, {
      // Fail fast instead of queueing forever while Redis is down: callers fall back
      // (cache = compute, alerts = local de-dup) rather than hanging requests.
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
      lazyConnect: false,
    });
    let lastErr = 0;
    this.client.on('error', (e) => {
      if (Date.now() - lastErr > 30_000) this.log.error(`redis error: ${e.message}`);
      lastErr = Date.now();
    });
  }

  get enabled() {
    return this.client !== null;
  }

  /** 'ok' | 'down' | null when not configured. */
  async health(): Promise<'ok' | 'down' | null> {
    if (!this.client) return null;
    try {
      let timer: NodeJS.Timeout | undefined;
      const pong = await Promise.race([
        this.client.ping(),
        new Promise<string>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 1_000); }),
      ]).finally(() => clearTimeout(timer));
      return pong === 'PONG' ? 'ok' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    if (!this.client) return;
    // quit() waits for the server; when Redis is unreachable it would hang shutdown.
    if (this.client.status === 'ready') await this.client.quit().catch(() => this.client?.disconnect());
    else this.client.disconnect();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
