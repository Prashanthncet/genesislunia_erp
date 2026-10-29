#!/usr/bin/env node
/**
 * Copy the SQLite database (default: prisma/dev.db) into the PostgreSQL
 * database in DATABASE_URL.
 *
 *   DATABASE_URL=postgresql://... node scripts/sqlite-to-postgres-import.js
 *   DATABASE_URL=... node scripts/sqlite-to-postgres-import.js --dry-run
 *   DATABASE_URL=... node scripts/sqlite-to-postgres-import.js --truncate
 *
 * What it does, in order:
 *   1. reads the SQLite tables (skips sqlite_* and _prisma_migrations);
 *   2. matches them to columns that exist in the Postgres schema (so a column
 *      added later on one side doesn't break the copy);
 *   3. coerces values to the Postgres column type — booleans (SQLite stores
 *      0/1), timestamps (Prisma writes UTC; we hand Postgres an explicit UTC
 *      string so a +05:30 machine doesn't shift every date), dates, JSON;
 *   4. inserts with ON CONFLICT DO NOTHING inside one transaction, retrying
 *      tables that hit a foreign-key violation after their parents landed;
 *   5. compares row counts and prints a per-table report.
 *
 * Account passwords (hashes) are copied like any other column, so the same
 * logins keep working. Nothing is invented: a row that Postgres rejects is
 * reported and the script exits non-zero rather than silently dropping data.
 */

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const TRUNCATE = args.has("--truncate");
const BATCH_LOG = 500;

const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(__dirname, "..", "prisma", "dev.db"));
const databaseUrl = process.env.DATABASE_URL;
const schema = process.env.PG_SCHEMA || "public";

if (!databaseUrl) {
  console.error("DATABASE_URL is required (postgresql://user:pass@host/db?sslmode=require)");
  process.exit(2);
}
if (/^file:/.test(databaseUrl)) {
  console.error("DATABASE_URL points at a SQLite file. Use the Postgres connection string.");
  process.exit(2);
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const { Client } = require("pg");

/* ── value coercion ─────────────────────────────────────────── */

/** Prisma writes DateTime as UTC. Postgres `timestamp(3)` has no zone, so hand
    it the UTC clock face explicitly instead of letting the driver apply +05:30. */
function utcStamp(value) {
  if (value == null) return null;
  const d = typeof value === "number" ? new Date(value) : new Date(String(value).replace(" ", "T") + (/(Z|[+-]\d\d:?\d\d)$/.test(String(value)) ? "" : "Z"));
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable timestamp: ${String(value)}`);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function toDateOnly(value) {
  if (value == null) return null;
  const s = String(value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(typeof value === "number" ? value : s);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable date: ${s}`);
  return d.toISOString().slice(0, 10);
}

function coerce(value, dataType) {
  if (value === null || value === undefined) return null;
  switch (dataType) {
    case "boolean":
      return !(value === 0 || value === "0" || value === "false" || value === false);
    case "timestamp without time zone":
    case "timestamp with time zone":
    case "timestamp":
      return utcStamp(value);
    case "date":
      return toDateOnly(value);
    case "json":
    case "jsonb":
      if (typeof value === "string") return value.trim() ? value : null;
      return JSON.stringify(value);
    case "integer":
    case "smallint":
    case "bigint":
    case "double precision":
    case "real":
    case "numeric":
      return typeof value === "bigint" ? value.toString() : Number(value);
    case "bytea":
      return value instanceof Uint8Array ? Buffer.from(value) : value;
    default:
      return typeof value === "bigint" ? value.toString() : value;
  }
}

/* ── run ────────────────────────────────────────────────────── */

(async () => {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: /sslmode=(require|verify)/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const sqliteTables = sqlite
    .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_prisma%' order by name")
    .all()
    .map((r) => r.name);

  const pgTables = new Set(
    (await client.query("select table_name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE'", [schema]))
      .rows.map((r) => r.table_name),
  );

  const only = sqliteTables.filter((t) => pgTables.has(t));
  const skipped = sqliteTables.filter((t) => !pgTables.has(t));

  /** name → { columns: [{name, dataType}], rows } */
  const work = [];
  for (const table of only) {
    const cols = await client.query(
      `select column_name, data_type, is_identity, is_generated
         from information_schema.columns
        where table_schema=$1 and table_name=$2
        order by ordinal_position`,
      [schema, table],
    );
    const pgCols = cols.rows
      .filter((c) => c.is_identity !== "YES" && c.is_generated === "NEVER")
      .map((c) => ({ name: c.column_name, dataType: c.data_type }));
    const sqliteCols = new Set(sqlite.prepare(`pragma table_info("${table}")`).all().map((c) => c.name));
    const usable = pgCols.filter((c) => sqliteCols.has(c.name));
    const rows = sqlite.prepare(`select * from "${table}"`).all();
    work.push({ table, columns: usable, rows, total: rows.length });
  }

  console.log(`SQLite: ${sqlitePath}`);
  console.log(`Postgres schema "${schema}": ${pgTables.size} tables`);
  if (skipped.length) console.log(`Only in SQLite (no Postgres table, skipped): ${skipped.join(", ")}`);
  if (DRY) {
    for (const w of work) console.log(`  ${w.table.padEnd(28)} ${String(w.total).padStart(6)} rows · ${w.columns.length} columns`);
    await client.end();
    return;
  }

  if (TRUNCATE) {
    const list = work.map((w) => `"${schema}"."${w.table}"`).reverse().join(", ");
    if (list) {
      await client.query("set session_replication_role = replica").catch(() => undefined);
      await client.query(`truncate table ${list} cascade`);
      await client.query("set session_replication_role = origin").catch(() => undefined);
      console.log(`Truncated ${work.length} tables`);
    }
  }

  /** FK-safe: tables whose parents haven't landed yet are retried. */
  let pending = work.slice();
  const done = [];
  const failures = [];
  let pass = 0;

  while (pending.length > 0 && pass < 8) {
    pass++;
    const retry = [];
    for (const w of pending) {
      const names = w.columns.map((c) => `"${c.name}"`).join(", ");
      const params = w.columns.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `insert into "${schema}"."${w.table}" (${names}) values (${params}) on conflict do nothing`;
      let inserted = 0;
      let fk = false;
      // One transaction per table: a foreign-key miss must not poison the others.
      await client.query("begin");
      try {
        for (const row of w.rows) {
          const values = w.columns.map((c) => coerce(row[c.name], c.dataType));
          const res = await client.query(sql, values);
          inserted += res.rowCount;
        }
        await client.query("commit");
        w.inserted = inserted;
        done.push(w);
        if (w.total >= BATCH_LOG) console.log(`  ${w.table}: ${inserted} inserted`);
      } catch (err) {
        await client.query("rollback");
        if (err.code === "23503") fk = true; // parent row not there yet → retry next pass
        else throw new Error(`${w.table}: ${err.message}`);
      }
      if (fk) retry.push(w);
    }
    if (retry.length === pending.length) {
      for (const w of retry) failures.push(`${w.table} (missing parent row)`);
      break;
    }
    pending = retry;
  }
  for (const w of pending) if (!failures.some((f) => f.startsWith(w.table))) failures.push(`${w.table} (unresolved)`);

  console.log("\nTable".padEnd(30) + "SQLite".padStart(8) + "Inserted".padStart(10) + "In PG".padStart(8));
  let mismatches = 0;
  for (const w of work) {
    const { rows } = await client.query(`select count(*)::int as n from "${schema}"."${w.table}"`);
    const pgCount = rows[0].n;
    const ok = pgCount >= w.total;
    if (!ok) mismatches++;
    console.log(
      w.table.padEnd(30) + String(w.total).padStart(8) + String(w.inserted ?? 0).padStart(10) + String(pgCount).padStart(8) + (ok ? "" : "  ← fewer than SQLite"),
    );
  }

  await client.end();

  if (failures.length) {
    console.error(`\nFailed tables: ${failures.join(", ")}`);
    process.exit(1);
  }
  if (mismatches) {
    console.error(`\n${mismatches} table(s) ended with fewer rows than SQLite — check the report above.`);
    process.exit(1);
  }
  console.log("\nImport complete: every table has at least as many rows as SQLite.");
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
