# Deploying Genesis ERP live

Three pieces, each on the host that fits it best:

| Piece | Where | Status |
|---|---|---|
| Frontend (Next.js 15) | **Cloudflare Workers** (`genesis-erp-web`) | **live** — `https://genesis-erp-web.jayanth-m.workers.dev` |
| Backend (NestJS 11 + Prisma) | **Render** Docker web service (`genesis-erp-api`) | blueprint ready in `render.yaml` |
| Database (Postgres) | **Neon** (project `genesis`, branch `production`) | project exists, schema + data pending |
| Uploaded files | **Neon object storage** (S3-compatible) | **verified** — bucket `genesis-documents` |

The browser only ever talks to the Worker. `/api/*` is intercepted by
`frontend/cf-worker.mjs` and proxied to whatever host sits in Workers KV (binding
`CONFIG`, key `BACKEND_URL`), so the API host can change **without a rebuild**:

```bash
cd frontend
npx wrangler kv key put --binding CONFIG "BACKEND_URL" "https://genesis-erp-api.onrender.com" --remote
```

A missing KV key returns a clean `503 {"statusCode":503,"message":"The school server
is not configured yet…"}` — never a `localhost` request. A tunnel that is up while the
backend is down returns `502` with a readable message instead of Cloudflare's HTML.

## Environment files — which one is which

| File | Purpose | Committed? |
|---|---|---|
| `backend/.env` | local dev: SQLite, local disk storage | no (git-ignored) |
| `backend/.env.production.local` | **paste-sheet** for the Render dashboard | no (git-ignored) |
| `backend/.env.example` | documents every variable | yes |
| `frontend/.env.local` | local dev only (`NEXT_PUBLIC_RAZORPAY_KEY_ID`) | no |
| `frontend/.env.example` | documents the KV/BACKEND_URL distinction | yes |
| `render.yaml` | blueprint: build args, health check, non-secret env | yes |

## 0. One-time accounts

| What | Where | Notes |
|---|---|---|
| Render | dashboard.render.com, Google SSO | needs GitHub access to the **private** repo `raoshishira/genesislumia_erp` |
| Neon | console.neon.tech, project `genesis` / branch `production` | free plan |
| Neon object storage | same project → Storage → `genesis-documents` | created; path-style S3 |
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | already used for the live Worker |

Never paste tokens into chat or commit them. `backend/.env.production.local` and
`backend/.env` are git-ignored for exactly this reason; `frontend/.deploy-backup/`
(which holds a wrangler OAuth token) is git-ignored too.

## 1. Database: schema, then your data

```bash
cd backend
export DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require"   # DIRECT host, no -pooler

# schema (additive, idempotent) — 3 migrations
npx prisma migrate deploy --schema prisma/postgres/schema.prisma

# your current dev data (SQLite → Postgres): 50/50 tables, row-for-row
DATABASE_URL="$DATABASE_URL" node scripts/sqlite-to-postgres-import.js

# dry run first if you like — prints row counts without writing:
DATABASE_URL="$DATABASE_URL" node scripts/sqlite-to-postgres-import.js --dry-run
```

Use the **direct** connection string here, not the pooled one: pgBouncer breaks the
prepared statements `migrate deploy` issues. Either is fine for the running app.

The importer copies every table that exists on both sides, coerces booleans (SQLite
stores 0/1), keeps timestamps in UTC (no IST shift), copies JSON and password hashes
unchanged, retries tables whose parents haven't landed yet, and exits non-zero if any
table ends with fewer rows than SQLite. Verified against a real PostgreSQL: 63
students, 489 invoices, 368 marks, 286 timetable slots, 18 users — every table equal.

Fresh demo data instead of the copy: `npm run seed` (one login per role).

## 2. Backend on Render

Either deploy the Blueprint (`New → Blueprint` → pick the repo → Render reads
`render.yaml`), or create a Web Service by hand and copy the values from
`backend/.env.production.local`. The Blueprint sets all of this for you:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PRISMA_SCHEMA` | `postgresql` — selects `prisma/postgres` and the PG build arg |
| `DATABASE_URL` | Neon direct URL (secret, dashboard only) |
| `JWT_SECRET` | `generateValue: true` (Render makes one) |
| `CORS_ORIGINS` / `FRONTEND_URL` | `https://genesis-erp-web.jayanth-m.workers.dev` |
| `TRUST_PROXY` | `1` — Render terminates TLS; without it every school shares one rate-limit bucket |
| `TZ_SCHOOL` | `Asia/Kolkata` — daily jobs run on this clock |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_REGION` / `S3_FORCE_PATH_STYLE` | `genesis-documents`, `https://br-steep-bonus-b4yvyujb.storage.c-6.us-east-2.aws.neon.tech`, `us-east-2`, `1` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Neon storage key pair (secrets) |

Two traps this blueprint already avoids:

- `STORAGE_DRIVER=s3` with an **empty** `S3_BUCKET` makes `storage.service.ts` throw,
  so the container crash-loops and Render reports a bare health-check failure.
- `STORAGE_DRIVER=local` is refused in production unless `STORAGE_ALLOW_LOCAL=1`, and
  the free plan has no persistent disk anyway.

The image runs `prisma migrate deploy --schema prisma/postgres/schema.prisma` and then
`node dist/src/main`; the health check is `/api/health`.

```bash
curl https://genesis-erp-api.onrender.com/api/health   # {"status":"ok","db":"ok",...}
```

Free plan note: the service sleeps after ~15 min idle, so the first request takes
~40 s. Move to the cheapest paid instance for a demo you can't afford to have cold.

## 3. Point the live site at the new API

```bash
cd frontend
npx wrangler kv key put --binding CONFIG "BACKEND_URL" "https://genesis-erp-api.onrender.com" --remote
```

No rebuild, no redeploy — the next request picks it up (`cacheTtl: 30`).

Rebuilding the Worker itself (only needed when frontend code changes):

```bash
cd frontend
export CLOUDFLARE_API_TOKEN="…" CLOUDFLARE_ACCOUNT_ID="…"
npm run cf:deploy
```

## 4. Smoke test on the live URL

1. `https://genesis-erp-web.jayanth-m.workers.dev/api/health` → `ok`, `db: ok`, low `db_ms`
   (a high `db_ms` on first hit is Neon waking up).
2. Sign in as `admin@sainik01.edu` — the dashboard must show real counts, not zeros.
3. Students → a profile → download a report card (proves PG + object storage).
4. Attendance → mark a class and save (proves the tenant/transaction path).
5. Fees → open an invoice PDF.
6. Admissions → upload a document → confirm the object appears under
   `branches/<branch>/admissions/<id>/` in the `genesis-documents` bucket.

## 5. Things that are still honest gaps

- **Payments**: set real `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`; test keys keep the
  gateway in test mode, and with none set the mock gateway is refused in production.
- **SMS / email**: set SMTP or MSG91/Twilio; otherwise notifications are logged as
  `mocked`, which the UI shows truthfully.
- **Demo logins** (`admin@…/Admin@123` etc.) are public in the repo — change those
  passwords before sharing the URL widely.
- **Backups**: enable `BACKUP_S3_BUCKET` (Render cron or `npm run backup`) for off-site
  dumps; Neon's point-in-time history is a paid-plan feature.
- **SQLite** is a dev convenience only; production must use Postgres.
