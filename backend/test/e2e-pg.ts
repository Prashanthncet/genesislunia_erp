import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Postgres mode for the e2e harness (E2E_PG_ADMIN_URL set, e.g.
 * postgresql://user:pass@localhost:5432/postgres). The suite then runs against real
 * PostgreSQL with the postgres schema/migrations instead of SQLite files. The Prisma
 * client must have been generated from prisma/postgres/schema.prisma (`npm run test:e2e:pg`).
 */
export const pgAdminUrl = () => process.env.E2E_PG_ADMIN_URL;

export function pgUrl(db: string): string {
  const u = new URL(pgAdminUrl()!);
  u.pathname = `/${db}`;
  return u.toString();
}

// Runs in a child process so the caller can stay synchronous (jest setupFiles can't await).
const RUNNER = `
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.PG_ADMIN });
c.connect()
  .then(() => c.query(process.env.PG_SQL))
  .then(() => c.end())
  .catch((e) => { console.error(e.message); process.exit(1); });
`;

/**
 * Runs SQL against the admin database with the plain `pg` driver: CREATE/DROP DATABASE
 * must run outside a transaction, and `prisma db execute` always wraps one.
 */
export function pgExec(sql: string): void {
  execFileSync(process.execPath, ['-e', RUNNER], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PG_ADMIN: pgAdminUrl(), PG_SQL: sql },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
