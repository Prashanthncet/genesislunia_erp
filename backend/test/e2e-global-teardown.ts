import * as fs from 'fs';
import * as path from 'path';
import { pgAdminUrl, pgExec } from './e2e-pg';

/** Removes the template DB and every per-file copy made from it. */
export default function globalTeardown() {
  const tpl = process.env.E2E_PG_TEMPLATE;
  if (pgAdminUrl() && tpl) {
    // Drop the template and every per-file clone (names share the e2e_<pid> stem).
    pgExec(`DO $$ DECLARE d text; BEGIN
      FOR d IN SELECT datname FROM pg_database WHERE datname = '${tpl}' OR datname LIKE '${tpl.replace('e2e_tpl_', 'e2e_')}\_%' LOOP
        EXECUTE format('DROP DATABASE IF EXISTS %I WITH (FORCE)', d);
      END LOOP; END $$;`);
    return;
  }
  const name = process.env.E2E_DB_FILE;
  if (!name) return;
  const dir = path.join(__dirname, '..', 'prisma');
  const stem = name.replace(/\.db$/, '');
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(stem)) continue;
    try { fs.rmSync(path.join(dir, f)); } catch { /* still locked on Windows; harmless, gitignored */ }
  }
}
