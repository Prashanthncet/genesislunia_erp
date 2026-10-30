# Deploying Genesis ERP live

Three pieces, each on the host that fits it best:

| Piece | Where | Status |
|---|---|---|
| Frontend (Next.js 15) | **Vercel** | **live** — `https://genesislumia-erp-demo.vercel.app` |
| Backend (NestJS 11 + Prisma) | **Render** Docker web service | **live** — `https://genesislumia-erp-demo.onrender.com` |
| Database (Postgres) | **Neon** (project `genesis`, branch `production`) | project exists; schema/data load is the open item |
| Uploaded files | **Neon object storage** (S3-compatible) | **verified** — bucket `genesis-documents` |

The browser talks to the Vercel frontend. `/api/*` calls are rewritten to the backend host
(configured in `frontend/next.config.mjs` via `BACKEND_URL`), so the API host can change
**without a rebuild**:

Set `BACKEND_URL` in the Vercel project environment variables:
- Dashboard → `genesislumia-erp-demo` → Settings → Environment Variables
- Add `BACKEND_URL` = `https://genesislumia-erp-demo.onrender.com`
- Vercel auto-redeploys when you change an env var (if configured); otherwise trigger
  a manual redeploy. The next request picks up the new backend with no code change.

A missing or wrong `BACKEND_URL` returns a clean `503` — never a `localhost` request.
When the backend is down you get `502` with a readable message instead of Vercel's HTML.

## Environment files — which one is which

| File | Purpose | Committed? |
|---|---|---|
| `backend/.env` | local dev: SQLite, local disk storage | no (git-ignored) |
| `backend/.env.production.local` | **paste-sheet** for the Render dashboard | no (git-ignored) |
| `backend/.env.example` | documents every variable | yes |
| `frontend/.env.local` | local dev only (`NEXT_PUBLIC_RAZORPAY_KEY_ID`) | no |
| `frontend/.env.example` | documents the BACKEND_URL/FRONTEND_URL distinction | yes |
| `render.yaml` | blueprint: build args, health check, non-secret env | yes |

## 0. One-time accounts

| What | Where | Notes |
|---|---|---|
| Vercel | dashboard.vercel.com | deploy the `frontend/` directory; set `BACKEND_URL` in project env |
| Render | dashboard.render.com, Google SSO | needs GitHub access to the **private** repo `raoshishira/genesislumia_erp` |
| Neon | console.neon.tech, project `genesis` / branch `production` | free plan |
| Neon object storage | same project → Storage → `genesis-documents` | created; path-style S3 |

Never paste tokens into chat or commit them. `backend/.env.production.local` and
`backend/.env` are git-ignored for exactly this reason.

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
| `CORS_ORIGINS` / `FRONTEND_URL` | `https://genesislumia-erp-demo.vercel.app` |
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
curl https://genesislumia-erp-demo.onrender.com/api/health   # {"status":"ok","db":"ok",...}
```

Free plan note: the service sleeps after ~15 min idle, so the first request takes
~40 s. Move to the cheapest paid instance for a demo you can't afford to have cold.

## 3. Point the live site at the new API

The Vercel frontend proxies `/api/*` to the backend host set in `BACKEND_URL`.
To point it at a new backend, set the environment variable in the Vercel project:

- Dashboard → `genesislumia-erp-demo` → Settings → Environment Variables
- `BACKEND_URL` = `https://genesislumia-erp-demo.onrender.com`
- Redeploy the frontend (Vercel auto-redeploys on env change if configured).

Rebuilding the frontend itself (only needed when frontend code changes):

```bash
cd frontend
export VERCEL_TOKEN="…"
npx vercel --prod
```

## 4. Smoke test on the live URL

1. `https://genesislumia-erp-demo.vercel.app/api/health` → `ok`, `db: ok`, low `db_ms`
   (a high `db_ms` on first hit is Neon waking up).
2. Sign in as `schooladmin@sainik01.edu` / `Demo@Admin1` — the dashboard must show real
   counts, not zeros. A `500` on login means the database has no tables/users yet; a
   `401` means the login is simply not in this database (see step 1).
3. Students → a profile → download a report card (proves PG + object storage).
4. Attendance → mark a class and save (proves the tenant/transaction path).
5. Fees → open an invoice PDF.
6. Admissions → upload a document → confirm the object appears under
   `branches/<branch>/admissions/<id>/` in the `genesis-documents` bucket.

## 5. Things that are still honest gaps

- **Payments**: set real `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`; test keys keep the
  gateway in test mode, and with none set the mock gateway is refused in production.
- **SMS / email / WhatsApp**: set the drivers below; a channel with no driver logs its
  messages as `mocked`, which the UI shows truthfully. Check what is actually wired with
  `cd backend && npm run build && node scripts/test-notifications.js --who`, then send a
  real test with `node scripts/test-notifications.js email|sms|whatsapp [recipient]`
  (defaults to `NOTIFY_TEST_EMAIL` / `NOTIFY_TEST_NUMBERS`).

### Outbound messaging setup

- **Email (working today)** — Gmail SMTP with an App Password:
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`,
  `SMTP_USER=<the Gmail address>`, `SMTP_PASS="abcd efgh ijkl mnop"` (the 16-character
  App Password *with its spaces*, from Google Account → Security → 2-Step Verification →
  App passwords), `SMTP_FROM="Genesis Lumia ERP <the Gmail address>"`. A normal account
  password, or an App Password with the spaces removed, is rejected with
  `535-5.7.8 Username and Password not accepted`.
- **WhatsApp (recommended next step)** — Meta WhatsApp Cloud API, the only route that
  lets you test for free: create an app at developers.facebook.com, add the WhatsApp
  product, note the **test phone number ID** and a **temporary access token**, then add
  each test number under *To* (the test number can message up to 5 recipients). Set
  `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` and the WhatsApp channel goes live.
  Free-form text only sends inside the 24-hour customer-service window; business-initiated
  messages to real parents need an approved template.
- **SMS** — three drivers, cheapest first:
  - **textbee** (free, MIT, https://github.com/textbee/textbee): install the Android app
    on a phone with an SMS SIM, scan its QR from the dashboard, then set `TEXTBEE_API_KEY`
    (and `TEXTBEE_DEVICE_ID` when several phones are paired). Messages leave from that
    phone's own number, so there is no rented number and no per-message fee; the phone has
    to stay online. Self-hostable with Docker Compose, or use the free hosted plan.
    **The app must be granted the SMS permission** (Android Settings → Apps → textbee →
    Permissions → SMS); without it textbee answers `200` with
    `warning.code = SMS_PERMISSION_MISSING` and the phone fails every message with
    `PERMISSION_DENIED: SMS permission not granted`. The driver treats that queued-but-
    undeliverable case as a failure, so `notification_logs` never claims it was sent.
    To see what really happened to each message, read
    `GET https://api.textbee.dev/api/v1/gateway/messages` with the `x-api-key` header: it
    returns each message's `status` and, when it failed, `errorCode` / `errorMessage`.
  - **MSG91** — `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` (Indian DLT rules require a
    registered sender and a template whose body is the `MSG91_BODY_VAR`, default
    `##message##`).
  - **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; sending to
    Indian numbers still needs a DLT-registered sender, and a trial account only reaches
    numbers verified in the console.
- **WhatsApp without a business account (free, un-official)** — run a self-hosted WhatsApp
  Web gateway and point `WHATSAPP_GATEWAY_URL` at it (e.g. WPPConnect Server:
  `docker run -p 21465:21465 -e SECRET_KEY=... wppconnect/wppconnect-server`, then open its
  QR endpoint with a school phone). Set `WHATSAPP_GATEWAY_SESSION` (default `genesis`) and
  `WHATSAPP_GATEWAY_TOKEN` from its generate-token call. The ERP posts
  `{ phone, message }` to `/api/<session>/send-message`. This links a real WhatsApp account,
  so keep it on a dedicated school number: WhatsApp may rate-limit or ban the account.
- **Why not way2sms / WhSms** — Way2SMS shut down in 2019 and both projects are
  screen-scraping clients for consumer accounts, so they carry no delivery guarantee and
  break the providers' terms. Nothing in the ERP should depend on them.
- **Demo logins** (`admin@…/Admin@123` etc.) are public in the repo — change those
  passwords before sharing the URL widely.
- **Backups**: enable `BACKUP_S3_BUCKET` (Render cron or `npm run backup`) for off-site
  dumps; Neon's point-in-time history is a paid-plan feature.
- **SQLite** is a dev convenience only; production must use Postgres.
