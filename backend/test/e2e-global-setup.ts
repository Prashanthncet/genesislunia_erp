import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pgAdminUrl, pgExec, pgUrl } from './e2e-pg';

/**
 * e2e runs against its own throwaway SQLite file, rebuilt from migrations + seed
 * on every run. Running against the persistent dev.db meant one leftover row from
 * an earlier run (or from clicking around the app) could fail all 84 tests in
 * beforeAll — and the suite wrote junk back into the demo data.
 * The file name is per-process so concurrent runs can't trample each other.
 */
export default function globalSetup() {
  const cwd = path.join(__dirname, '..');
  if (pgAdminUrl()) {
    // Postgres: migrate + seed a template database; each test file clones it (e2e-env.ts).
    const tpl = `e2e_tpl_${process.pid}`;
    pgExec(`DROP DATABASE IF EXISTS ${tpl}`);
    // UTF-8 explicitly: a cluster initialised with a Windows code page (WIN1252) cannot
    // store names like "₹" or Devanagari text. Production databases must be UTF-8 too.
    pgExec(`CREATE DATABASE ${tpl} WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
    process.env.E2E_PG_TEMPLATE = tpl;
    const env = { ...process.env, DATABASE_URL: pgUrl(tpl), NODE_ENV: 'test' };
    execSync('npx prisma migrate deploy --schema prisma/postgres/schema.prisma', { cwd, env, stdio: 'pipe' });
    execSync('npx prisma db seed', { cwd, env, stdio: 'pipe' });
    return;
  }

  const name = `test-e2e-${process.pid}.db`;
  const prismaDir = path.join(__dirname, '..', 'prisma');
  const dbFile = path.join(prismaDir, name);
  // Sweep copies an earlier run couldn't delete (Windows keeps files locked until exit).
  // Only files untouched for 3h: a concurrent run's live template must survive this.
  const staleBefore = Date.now() - 3 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(prismaDir)) {
    if (!/^test-e2e-.*\.db(-journal)?$/.test(f)) continue;
    const full = path.join(prismaDir, f);
    try {
      if (fs.statSync(full).mtimeMs < staleBefore) fs.rmSync(full);
    } catch { /* in use or already gone */ }
  }

  process.env.E2E_DB_FILE = name;
  const env = { ...process.env, DATABASE_URL: `file:./${name}`, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx prisma db seed', { cwd, env, stdio: 'pipe' });
}
