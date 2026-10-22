/**
 * Generates prisma/postgres/schema.prisma from prisma/schema.prisma (the SQLite schema
 * used in development) by swapping the datasource provider. Models are identical, so
 * the two can never drift: CI runs this with --check and fails if the committed file
 * is stale.
 *
 *   node scripts/make-postgres-schema.js          write the file
 *   node scripts/make-postgres-schema.js --check  exit 1 if it is out of date
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const header = '// GENERATED from ../schema.prisma by scripts/make-postgres-schema.js — do not edit by hand.\n';
const out = header + src.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
if (out === header + src) throw new Error('sqlite provider line not found in schema.prisma');

const target = path.join(__dirname, '..', 'prisma', 'postgres', 'schema.prisma');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== out) {
    console.error('prisma/postgres/schema.prisma is stale — run: node scripts/make-postgres-schema.js');
    process.exit(1);
  }
  console.log('postgres schema up to date');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  console.log(`wrote ${path.relative(process.cwd(), target)}`);
}
