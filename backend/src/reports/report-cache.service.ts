import { Injectable, Logger, Module } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * TTL cache for report aggregates. Two drivers behind one interface:
 *
 *  - REDIS_URL set: shared Redis cache. Every instance sees the same entries, and
 *    invalidating a school is one INCR of that school's version key
 *    (`rc:<branch>:v`) — entries are stored under `rc:<branch>:<version>:…`, so old
 *    versions simply stop being read and expire by TTL. No SCAN/KEYS needed. If Redis
 *    errors, the value is computed (never fails the request).
 *  - otherwise: per-process Map (lost on restart, not shared between instances).
 *
 * Keys always start with the branch id, so one school's numbers can never be served to
 * another. TTL: REPORT_CACHE_TTL_MS (default 60 s, 0 disables). `fresh` (?fresh=1)
 * bypasses and refreshes an entry.
 */
@Injectable()
export class ReportCacheService {
  private readonly log = new Logger('ReportCache');
  private store = new Map<string, { expires: number; value: unknown; at: string }>();
  private readonly maxEntries = 500;

  constructor(private redis: RedisService) {}

  get ttlMs(): number {
    const v = Number(process.env.REPORT_CACHE_TTL_MS);
    return Number.isFinite(v) && v >= 0 ? v : 60_000;
  }

  get driver(): 'redis' | 'memory' {
    return this.redis.enabled ? 'redis' : 'memory';
  }

  key(branchId: string, name: string, parts: Record<string, unknown>): string {
    const norm = Object.keys(parts)
      .sort()
      .filter((k) => parts[k] !== undefined && parts[k] !== null && parts[k] !== '')
      .map((k) => `${k}=${JSON.stringify(parts[k])}`)
      .join('&');
    return `${branchId}|${name}|${norm}`;
  }

  /** Returns the cached value or computes it. `hit` tells the caller which happened. */
  async wrap<T>(key: string, fresh: boolean, compute: () => Promise<T>): Promise<{ value: T; hit: boolean; at: string }> {
    return this.redis.client ? this.wrapRedis(key, fresh, compute) : this.wrapMemory(key, fresh, compute);
  }

  /** Drop every cached aggregate of one school (called after writes, e.g. marks entry). */
  async invalidateBranch(branchId: string): Promise<void> {
    for (const k of this.store.keys()) if (k.startsWith(`${branchId}|`)) this.store.delete(k);
    if (!this.redis.client) return;
    try {
      await this.redis.client.incr(versionKey(branchId));
    } catch (e) {
      this.log.warn(`invalidate ${branchId} failed: ${(e as Error).message}`);
    }
  }

  private async wrapRedis<T>(key: string, fresh: boolean, compute: () => Promise<T>) {
    const client = this.redis.client!;
    const branchId = key.split('|')[0];
    let redisKey: string | null = null;
    try {
      const version = (await client.get(versionKey(branchId))) ?? '0';
      redisKey = `rc:${branchId}:${version}:${key}`;
      if (!fresh) {
        const raw = await client.get(redisKey);
        if (raw) {
          const entry = JSON.parse(raw) as { value: T; at: string };
          return { value: entry.value, hit: true, at: entry.at };
        }
      }
    } catch (e) {
      this.log.warn(`redis read failed, computing: ${(e as Error).message}`);
      redisKey = null;
    }
    const value = await compute();
    const at = new Date().toISOString();
    if (redisKey && this.ttlMs > 0) {
      await client.set(redisKey, JSON.stringify({ value, at }), 'PX', this.ttlMs).catch(() => undefined);
    }
    return { value, hit: false, at };
  }

  private async wrapMemory<T>(key: string, fresh: boolean, compute: () => Promise<T>) {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!fresh && entry && entry.expires > now) {
      return { value: entry.value as T, hit: true, at: entry.at };
    }
    const value = await compute();
    const at = new Date().toISOString();
    if (this.ttlMs > 0) {
      if (this.store.size >= this.maxEntries) {
        // Drop expired entries first, then the oldest insertion.
        for (const [k, e] of this.store) if (e.expires <= now) this.store.delete(k);
        if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
      }
      this.store.set(key, { value, expires: now + this.ttlMs, at });
    }
    return { value, hit: false, at };
  }
}

function versionKey(branchId: string) {
  return `rc:${branchId}:v`;
}

@Module({
  providers: [ReportCacheService],
  exports: [ReportCacheService],
})
export class ReportCacheModule {}
