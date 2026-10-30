import * as fs from 'fs';
import * as path from 'path';
import { pgAdminUrl, pgExec, pgUrl } from './e2e-pg';

// Every test FILE gets its own copy of the migrated + seeded template DB that
// e2e-global-setup.ts built, so suites can't see each other's writes (the legacy
// suite rewrites the bell schedule, which broke the generator suite depending on
// run order). ConfigModule never overrides an already-set variable, so .env can't win.
if (pgAdminUrl() && process.env.E2E_PG_TEMPLATE) {
  const tpl = process.env.E2E_PG_TEMPLATE;
  const db = `${tpl.replace('e2e_tpl_', 'e2e_')}_${process.hrtime.bigint().toString(36)}`;
  pgExec(`CREATE DATABASE ${db} TEMPLATE ${tpl};`);
  process.env.DATABASE_URL = pgUrl(db);
} else {
  const template = process.env.E2E_DB_FILE ?? 'test-e2e.db';
  const prismaDir = path.join(__dirname, '..', 'prisma');
  const copy = template.replace(/\.db$/, `-${process.hrtime.bigint().toString(36)}.db`);
  fs.copyFileSync(path.join(prismaDir, template), path.join(prismaDir, copy));
  process.env.DATABASE_URL = `file:./${copy}`;
}
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT ?? '1000';

// Tests always use the mock payment gateway: never create real orders even when a developer's
// backend/.env holds Razorpay test keys (ConfigModule won't override variables already set).
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
process.env.RAZORPAY_SECRET = '';
process.env.SMTP_HOST = '';
process.env.TEXTBEE_API_KEY = '';
process.env.MSG91_AUTH_KEY = '';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.VONAGE_API_KEY = '';
process.env.WHATSAPP_TOKEN = '';
process.env.WHATSAPP_GATEWAY_URL = '';
process.env.NOTIFY_WEBHOOK_URL = '';
