# Genesis ERP — Reality Assessment v4 (2026-10-22)

Measured against `School_ERP_Full_Delivery_Plan (3).pdf` (Phases 0–11; the plan has no Phase 12).
v2 of this file overstated the system badly (see git history / PROJECT_MEMORY §8–9). v3 (2026-10-21) listed what was
still "not real". v4 is after the second pass that built those items. Everything below was run, not assumed.

## Verification (2026-10-22)
| Check | Result |
|---|---|
| Backend / frontend typecheck | 0 errors / 0 errors |
| Production builds | `nest build` OK · `next build` OK (all routes) |
| Unit tests | 51/51 (grade engine, payroll tax, school timezone, tenant layer, PDF, DTOs…) |
| e2e on SQLite | **366/366**, 13 suites, each test file on its own freshly migrated + seeded DB |
| e2e on **PostgreSQL 17** | **366/366** (same suites, real Postgres) |
| Two-school "school year" scenario (plan Phase 11 joint sync) | pass on both databases: admission through every role → attendance → online fee → published report card → CBT taken by the student's own login → payroll, both schools concurrently, isolation cross-checked |
| Tenant isolation sweep (every list endpoint, foreign-id reads + writes) | pass |
| Load test, SQLite / Postgres, 30 clients, 25% writes | 0 errors · p95 1.8 s / 1.0 s · 0 cross-school leaks (laptop, ~1.5 GB free RAM) |
| Backups | SQLite snapshot + integrity check ✓ · Postgres `pg_dump` → **restored into an empty DB, row counts identical** ✓ · off-site upload verified against an S3 server ✓ |
| Migrations vs schema | no drift (SQLite) · generated Postgres schema in sync |
| Browser, every role | 18 roles/logins × every page in their nav ≈ 200 page loads: no unexpected "access denied", 0 console errors, 0 failed API calls after fixes. Admissions clicked end to end (AO → parent form with a 3.4 MB scan → AO → payment → Accounts → VP → Principal digital sign → student + letter PDF); CBT player clicked end to end (countdown, autosave, refresh-safe, submit, teacher grading → student sees 5/5) |

## Phase by phase
| Phase | Status | What is still not real (honest) |
|---|---|---|
| 0 Foundations | ✅ 16 roles, role re-checked every request; **central tenant layer** (request context + Prisma extension) on top of per-query checks; SQLite or PostgreSQL | Tenant layer scopes top-level queries; nested relation filters and raw SQL rely on the per-query checks (kept everywhere). |
| 1 Admissions | ✅ per-step roles, history, send-back, template approval, 15-day links, reminders (run once across servers), online + offline payment, roll no, house, digital sign, letter PDF | Razorpay coded + tested against our own signed mock — **never against real Razorpay** (needs keys). |
| 2 SIS / Comms / Fees | ✅ profile, parent confirmation, **documents in object storage (S3/R2/local), folder per student**, TC/ID-card, receipts; email (SMTP), SMS (MSG91/Twilio), WhatsApp (Twilio), signed webhook; retries | SMTP tested against a real SMTP server locally; MSG91/Twilio only against stubs of their documented APIs; S3 tested against s3rver, not real R2/AWS. All need accounts. |
| 3 Attendance / Timetable | ✅ incl. **class teacher**, substitution with conflict engine, absence SMS | — |
| 4 Leave / Gate pass | ✅ | — |
| 5 Safeguarding | ✅ | School admin deliberately not on the case team — the school must confirm. |
| 6 Academics | ✅ grade engine, **report cards frozen per term** (publish → snapshot; parents see only published) | — |
| 7 Reports | ✅ filters, CSV/XLSX/PDF; **Redis cache** when REDIS_URL set (tested on real Redis), in-memory otherwise | — |
| 8 Hostel | ✅ **Bed table** (beds per room, out-of-service beds, race-safe allocation), roll-call, visitors | — |
| 9 Staff & Payroll | ✅ **Indian income tax FY 2025-26 (new + old regime, 87A, cess, surcharge), professional tax presets, EPF ceiling**, payslip PDF | Rates are from model knowledge, **must be verified by a CA**. No surcharge marginal relief; no women's PT exemption (no gender field on staff); no year-end TDS true-up / Form 16. |
| 10 CBT | ✅ | — |
| 11 QA / Deploy | 🟡 regression (366 × 2 databases), school-year scenario, isolation sweep, load tests, backup + restore drill, Dockerfiles (SQLite + Postgres), compose, CI (SQLite + Postgres jobs), health, structured logs, Sentry + alert webhook, Redis-backed rate limits | **Not deployed. CI has never run on GitHub (nothing pushed). Docker images never built (no Docker on this machine).** No Sentry project/DSN connected. Load numbers are from a memory-starved laptop. |

## Fixed during verification (would have hit real users)
- Uploading a document on the parent form wiped every answer typed so far.
- JSON body limit (100 KB) rejected every real document scan (413).
- SQLite under concurrent writes: 72% of writes failed → WAL, single connection, queued transactions.
- Concurrent saves of the same roll call / marks → 500 (unique race) → retry.
- CBT tests with a typed start time opened 5½ h late on a UTC server; UI showed close before open.
- PostgreSQL databases created with a Windows code page couldn't store "₹" / Indian-language names.
- Pages calling APIs the viewer may not use (403/404 noise) on hostel, classes and staff screens.
- Rate limits behind a reverse proxy would have throttled the whole school as one client (TRUST_PROXY).

## What only you can do now
1. Push the branch so CI (SQLite + Postgres jobs) runs on GitHub.
2. Choose hosting and deploy (Postgres + S3/R2 recommended — see docs/OPERATIONS.md).
3. Provide accounts/keys: Razorpay (test mode first), an SMS provider (MSG91 or Twilio; DLT templates for India), SMTP, S3/R2 bucket, Sentry DSN.
4. Have a CA verify the payroll tax table; have the school confirm the role decisions (safeguarding team, teacher contact visibility, what security staff may browse).
