/**
 * Online SQLite backup: `VACUUM INTO` writes a consistent snapshot while the API
 * keeps serving, then the copy is opened and integrity-checked, and old backups
 * beyond BACKUP_KEEP are pruned. Exit code != 0 on any failure, so cron/compose
 * can alert on it.
 *
 *   node scripts/backup-db.js                 (uses DATABASE_URL, BACKUP_DIR=./backups, BACKUP_KEEP=14)
 *   restore: stop the API, copy a backup over the DATABASE_URL file, start the API.
 *
 * Off-site copy: when BACKUP_S3_BUCKET is set, the verified snapshot is also uploaded to
 * s3://$BACKUP_S3_BUCKET/backups/<name> using the same S3_ENDPOINT / S3_REGION /
 * S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_FORCE_PATH_STYLE as document storage
 * (R2 or AWS S3), confirmed by a HEAD whose size must match, and remote copies beyond
 * BACKUP_KEEP_REMOTE (default 30) are pruned. Upload failure → exit code 1.
 *
 * PostgreSQL (DATABASE_URL=postgresql://…): `pg_dump -Fc` (custom format, consistent
 * snapshot from one transaction), verified with `pg_restore --list` (the archive must be
 * readable and contain the students table data). Needs pg_dump/pg_restore of the SERVER's
 * major version on PATH, or PG_DUMP_BIN / PG_RESTORE_BIN. The password goes through
 * PGPASSWORD, never the command line (visible in the process list).
 *   restore: pg_restore --clean --if-exists --no-owner -d <database-url> erp-<stamp>.dump
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');
const { S3Store, s3ConfigFromEnv } = require('./lib/object-store');

const BACKUP_FILE = /^erp-.*\.(db|dump)$/;

/** pg_dump the database to `target`, then prove the archive is readable. */
function backupPostgres(url, target) {
  const u = new URL(url);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password) };
  const conn = ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username), '-d', u.pathname.slice(1)];
  const dump = spawnSync(process.env.PG_DUMP_BIN || 'pg_dump', ['-Fc', '--no-owner', '--no-privileges', '-f', target, ...conn], { env, encoding: 'utf8' });
  if (dump.error) throw new Error(`pg_dump not runnable: ${dump.error.message} (install the PostgreSQL client or set PG_DUMP_BIN)`);
  if (dump.status !== 0) throw new Error(`pg_dump failed: ${dump.stderr.trim()}`);
  const list = spawnSync(process.env.PG_RESTORE_BIN || 'pg_restore', ['--list', target], { encoding: 'utf8' });
  if (list.status !== 0) throw new Error(`pg_restore --list failed: ${(list.stderr || '').trim()}`);
  const tables = (list.stdout.match(/ TABLE DATA public /g) || []).length;
  if (!/ TABLE DATA public students /.test(list.stdout)) throw new Error('archive has no data for table students');
  return { tables_with_data: tables };
}

async function uploadOffsite(file, env = process.env) {
  const bucket = env.BACKUP_S3_BUCKET;
  if (!bucket) return null;
  const keepRemote = Math.max(1, Number(env.BACKUP_KEEP_REMOTE || 30));
  const store = new S3Store(s3ConfigFromEnv(env, bucket));
  const name = path.basename(file);
  const key = `backups/${name}`;
  const bytes = fs.readFileSync(file);
  await store.put(key, bytes, name.endsWith('.dump') ? 'application/octet-stream' : 'application/vnd.sqlite3');
  const remoteSize = await store.size(key);
  if (remoteSize !== bytes.length) throw new Error(`off-site verification failed: HEAD size ${remoteSize} != local ${bytes.length}`);
  const remote = (await store.list('backups/erp-')).filter((o) => BACKUP_FILE.test(o.key.replace(/^backups\//, ''))).map((o) => o.key).sort().reverse();
  const prune = remote.slice(keepRemote);
  for (const k of prune) await store.delete(k);
  return { bucket, key, bytes: remoteSize, verified: 'head-size-match', pruned_remote: prune };
}

async function main() {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
  const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (/^postgres(ql)?:/.test(url)) {
    const target = path.join(dir, `erp-${stamp}.dump`);
    const check = backupPostgres(url, target);
    console.log(JSON.stringify({ backup: target, bytes: fs.statSync(target).size, integrity: 'pg_restore --list ok', ...check }));
    await finish(dir, keep, target);
    return;
  }
  if (!url.startsWith('file:')) throw new Error(`unsupported DATABASE_URL scheme for backup: ${url.split(':')[0]}`);

  const target = path.join(dir, `erp-${stamp}.db`);

  const live = new PrismaClient();
  try {
    // Path is generated here, never user input; single quotes escaped regardless.
    await live.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    await live.$disconnect();
  }

  const copy = new PrismaClient({ datasources: { db: { url: `file:${target}` } } });
  try {
    const rows = await copy.$queryRawUnsafe('PRAGMA integrity_check');
    const verdict = Object.values(rows[0] || {})[0];
    if (verdict !== 'ok') throw new Error(`integrity_check failed: ${verdict}`);
    const [{ n }] = await copy.$queryRawUnsafe('SELECT count(*) AS n FROM students');
    console.log(JSON.stringify({ backup: target, bytes: fs.statSync(target).size, integrity: 'ok', students: Number(n) }));
  } finally {
    await copy.$disconnect();
  }

  await finish(dir, keep, target);
}

/** Local retention + optional off-site copy, shared by both engines. */
async function finish(dir, keep, target) {
  const old = fs.readdirSync(dir).filter((f) => BACKUP_FILE.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.rmSync(path.join(dir, f));
  if (old.length) console.log(JSON.stringify({ pruned: old }));

  const offsite = await uploadOffsite(target);
  if (offsite) console.log(JSON.stringify({ offsite }));
}

main().catch((err) => {
  console.error(JSON.stringify({ backup: 'failed', error: String(err && err.message || err) }));
  process.exit(1);
});
