import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { tenantExtension } from './tenant-extension';

/** Delegate property names (`student`, `feeInvoice`, …) derived from the DMMF. */
const MODEL_KEYS = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1)));

const isSqlite = () => (process.env.DATABASE_URL ?? '').startsWith('file:');

/**
 * SQLite allows one writer at a time. With Prisma's default 5 s socket timeout a burst of
 * concurrent writes (two schools marking attendance + taking fees) turned into 500s.
 * A longer timeout lets writers queue instead of failing; WAL (set in onModuleInit) lets
 * reads continue while a write commits. Explicit URL params always win.
 */
/**
 * SQLite has ONE writer. Two interactive transactions that both read then write (next
 * invoice number, payment balance) deadlock: neither can upgrade its lock, both wait out
 * the timeout, one fails — measured at ~24 s per invoice under load. Queuing transactions
 * in-process removes the deadlock (SQLite deployments are single-instance by design;
 * Postgres skips this entirely).
 */
let sqliteTxTail: Promise<unknown> = Promise.resolve();
function serializeSqlite<T>(run: () => Promise<T>): Promise<T> {
  const result = sqliteTxTail.then(run, run);
  sqliteTxTail = result.catch(() => undefined);
  return result;
}

function sqliteUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !isSqlite()) return undefined;
  const params: string[] = [];
  // One connection: queries run strictly one after another, so writers never contend for
  // SQLite's lock (each lock conflict otherwise costs a busy-wait sleep — measured at
  // 15-25 s per write under a 30-client write load). Each query is milliseconds, so this
  // is far faster under load than a pool fighting over one write lock.
  if (!/[?&]connection_limit=/.test(url)) params.push(`connection_limit=${process.env.SQLITE_CONNECTIONS ?? 1}`);
  if (!/[?&]socket_timeout=/.test(url)) params.push(`socket_timeout=${process.env.SQLITE_SOCKET_TIMEOUT_S ?? 30}`);
  if (!params.length) return undefined;
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`;
}

/**
 * The app's Prisma client. Typed and injected exactly like a plain PrismaClient
 * (`this.prisma.student.findMany(...)`, `this.prisma.$transaction(...)`), but every
 * model delegate and `$transaction` is routed through the tenant extension
 * (tenant-extension.ts), so queries made inside an authenticated request are scoped to
 * the caller's school automatically. Outside a request context nothing changes.
 *
 * `unscoped` exposes the raw client for the rare reviewed cross-school read.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Raw client without the tenant extension. Use only with a comment explaining why. */
  declare readonly unscoped: PrismaClient;

  constructor() {
    const url = sqliteUrl();
    super(url ? { datasources: { db: { url } } } : undefined);
    const base = this as PrismaClient;
    const scoped = base.$extends(tenantExtension) as unknown as Record<string | symbol, unknown>;
    // The extended client is a separate object; this proxy keeps PrismaService the
    // injectable class (lifecycle hooks, instanceof) while sending model access and
    // transactions through the extension. Interactive transactions opened via
    // `$transaction` get an extended `tx`, so they are scoped as well.
    // Bound to the extended client: called as `prisma.$transaction(...)` it would otherwise
    // run with `this` = this proxy and open an UNscoped transaction.
    const boundTransaction = (scoped.$transaction as (...a: unknown[]) => Promise<unknown>).bind(scoped);
    const scopedTransaction = isSqlite()
      ? (...args: unknown[]) => serializeSqlite(() => boundTransaction(...args))
      : boundTransaction;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'unscoped') return target;
        if (prop === '$transaction') return scopedTransaction;
        if (typeof prop === 'string' && MODEL_KEYS.has(prop)) return scoped[prop];
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    if (isSqlite()) {
      // WAL is stored in the database file, so it applies to every pooled connection:
      // readers no longer block behind a writer. synchronous=NORMAL (per connection, best
      // effort) is the documented-safe pairing with WAL: a power cut can lose the last
      // commit, never corrupt the file.
      await this.$queryRawUnsafe('PRAGMA journal_mode=WAL');
      await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
