/**
 * Runs the whole e2e suite against PostgreSQL, then restores the SQLite Prisma client
 * (even on failure), so the dev setup is left as it was.
 *   E2E_PG_ADMIN_URL=postgresql://user:pass@localhost:5432/postgres npm run test:e2e:pg
 */
const { spawnSync } = require('child_process');

if (!process.env.E2E_PG_ADMIN_URL) {
  console.error('Set E2E_PG_ADMIN_URL to an admin connection (database "postgres").');
  process.exit(2);
}
const run = (cmd) => spawnSync(cmd, { stdio: 'inherit', shell: true, cwd: `${__dirname}/..` }).status ?? 1;

let status = run('node scripts/make-postgres-schema.js');
if (status === 0) status = run('npx prisma generate --schema prisma/postgres/schema.prisma');
// Extra args (test file filters) are passed through to jest.
const extra = process.argv.slice(2).join(' ');
if (status === 0) status = run(`npx jest --config ./test/jest-e2e.json --runInBand ${extra}`);
const restored = run('npx prisma generate');
process.exit(status || restored);
