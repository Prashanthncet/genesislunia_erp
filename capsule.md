# Capsule — Genesis ERP handoff (2026-10-24)

Hand this file to the next AI. It is self-contained: what the project is, where it stands, what is
half-done, how to verify, and the rules the owner (Jayanth) insists on. Deeper history: `PROJECT_MEMORY.md`
(§9–§11), `MODULE_ASSESSMENT.md`, `docs/OPERATIONS.md`.

## 1. The project in one paragraph
School ERP (Sainik School demo + a second school "greenfield02" for isolation tests). Delivered against
`School_ERP_Full_Delivery_Plan (3).pdf` (Phases 0–11). Stack: **Next.js 15 + Tailwind v4** (`frontend/`, port
5173, `/api/*` rewritten to the backend — `BACKEND_URL` is baked in at BUILD time) and **NestJS 11 + Prisma 6**
(`backend/`, port 3001, prefix `/api`). Database: **SQLite by default, PostgreSQL supported** (generated schema
`prisma/postgres/schema.prisma`, own migrations). Windows machine, Git Bash; memory is tight (~1.5 GB free).

## 2. Owner's rules (non-negotiable)
1. **Never add a watermark/attribution** anywhere: no "Generated with…", no "Co-Authored-By" in commits, files, docs.
2. **Always check upstream before building** (`git fetch`); if someone else changed/removed something we touched, say so up front.
3. **Log every change in `PROJECT_MEMORY.md`**, even tiny ones.
4. Verify by running things, report failures honestly, never weaken tests to go green, never say "done" unverified.
5. Don't commit/push unless asked. Be candid and human.

## 3. Repo / branch state
- `origin/main` = merge of PR #2 (phase 0–11 completion). Someone removed `.github/workflows/ci.yml` (commit
  b02823a) because the gh token lacks the `workflow` scope → **CI does not run on GitHub**. Restore it only after
  `gh auth refresh -h github.com -s workflow`.
- **Current work branch: `jayanth/feedback-round-1`** (from main). ALL round-3 work below is **uncommitted** on it.
- `backend/prisma/dev.db` (local demo DB) is still on the OLD seed (4 logins, principal@ = branch_admin).
  Reseed before demoing (back it up first): `cd backend && npx prisma migrate deploy && npx prisma db seed`.

## 4. Roles & demo logins (from `backend/prisma/seed.ts` → `DEMO_LOGINS`)
16 roles in `backend/src/auth/roles.ts` (groups `R.*`), mirrored in `frontend/src/lib/auth.tsx`.
| login | password | role |
|---|---|---|
| admin@sainik01.edu | Admin@123 | super_admin |
| schooladmin@sainik01.edu | Demo@Admin1 | branch_admin |
| principal@ / vp@ / os@ / ao@ / accounts@ / hr@ / hod@ / teacher@ / warden@ / security@ / discipline@ (all @sainik01.edu) | Demo@Principal1 / Demo@Vp1 / Demo@Os1 / Demo@Ao1 / Demo@Accounts1 / Demo@Hr1 / Demo@Hod1 / Demo@Teacher1 / Demo@Warden1 / Demo@Security1 / Demo@Discipline1 | matching role |
| parent@sainik01.edu | Demo@Parent1 | parent of stu_001 + stu_004 |
| student@sainik01.edu | Demo@Student1 | student stu_001 |
| admin@greenfield02.edu | Demo@Green1 | branch_admin, second school |

## 5. Round 3 — client feedback (what was asked → status)
School decisions (2026-10-24): Teacher and Warden stay **separate logins**; **Warden = hostel + gate desk + pass
records + student list**; **Security = gate desk + visitors only** (both keep self-service: own leave, own payslips,
report an incident); **OD = On Duty, counts as present, mandatory reason, no absence SMS**; "Jayantha attendance":
nobody by that name in our data → attendance maths audited.

| Feedback item | Status |
|---|---|
| Warden: Gate Desk → pass issue, all pass records | ✅ new `/gate` page: Issue pass (`POST /gate-passes {issue:true}` = created + warden-approved), Approvals, Verify & exit/return, Pass records (filters + CSV), Visitors |
| Warden/Security scope; remove Student/Class/Academic/Hostel for Security | ✅ `R.ACADEMIC_STAFF` (staff minus warden/security) on classes/timetable/academics/exams; nav + route guard + backend roles |
| Students card/table UI | ✅ own card design + table cleanup (warden read-only) |
| Attendance: section filter, absent filter, monthly UI, mark UI, analytics filter, Present/Absent UI | ✅ `components/attendance/*` |
| OD-based attendance | ✅ status `OD`, reason in `AttendanceRecord.note`, counts present, no SMS |
| "Jayantha attendance" | ✅ root cause found: the same student showed up to 4 different % across screens; ONE rule now (`attendance-math.ts`), 13 endpoints agree (tested) |
| Timetable: lunch break, download, day view | ✅ lunch row in bell schedule (period 7, 13:00–14:00), class/teacher week PDFs, Day View |
| Logout SweetAlert | ✅ `confirmLogout()` (sweetalert2) in user menu, mobile drawer, Settings |
| Hostel roll call table UI | ✅ rebuilt; "Last marked" shows time + marker name |
| Staff & Payroll table UI | ✅ |
| Student notifications | ✅ `backend/src/notices` (Notice/NoticeRead), staff compose (/notifications tab; "Notify class" for teachers in Academics), portal "Notices & messages" + unread badge |
| Report Analysis alignment | ✅ |
| Fees card → Download PDF | ✅ root cause: card view had NO receipt download; added invoice + receipt buttons; apiDownload keeps blob 60 s (1 s broke iOS/Firefox) |
| Academics lesson plan PDF upload | ✅ attach/replace/remove/download + plan PDF export |
| Student attendance / fees table UI | ✅ portal attendance + `/portal/fees` rebuilt |
| Teacher profile UI, change password flow | ✅ `/account`, `/account/password` |

Tests at last full run (before the Razorpay work): **e2e 406/406 (16 suites), unit 51/51, both apps tsc 0** —
must be re-run after the items in §6.

## 6. Unfinished — do these next, in order
1. **Fix the TypeScript error** in `frontend/src/app/(dashboard)/portal/fees/page.tsx` (~line 60):
   `prefill: { name: child.fullName }` → `prefill: { name: child.full_name }`. Then `cd frontend && npx tsc --noEmit`
   and check `frontend/src/app/admission-form/page.tsx` has no leftover `loadRazorpay`/`window.Razorpay` references.
2. **Razorpay test mode** (the owner's latest request: "on click of Pay it should call Razorpay"):
   - Keys are ALREADY in git-ignored files: `backend/.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) and
     `frontend/.env.local` (`NEXT_PUBLIC_RAZORPAY_KEY_ID`). Never print, commit or copy the secret anywhere.
   - Backend: `payments.service.ts` creates real orders via `https://api.razorpay.com/v1/orders` when keys are set;
     `razorpayKeySecret()` also accepts `RAZORPAY_SECRET`. Verify endpoint: `POST /api/payments/razorpay/verify`
     (HMAC of `order_id|payment_id` with the key secret). Webhook (`/payments/webhook/razorpay`) needs
     `RAZORPAY_WEBHOOK_SECRET` — not provided, so client-side verify is the confirmation path.
   - Frontend: `frontend/src/lib/razorpay.ts` → `payWithRazorpay(order, {name, description, prefill})` opens
     Checkout and verifies; used by `/portal/fees` (parent Pay) and `/admission-form` (admission fee).
   - `backend/test/e2e-env.ts` blanks RAZORPAY_* so tests use the mock gateway — keep it that way.
   - TO DO: start backend (it loads `.env`), log in as parent, Pay an invoice in the browser → Checkout should open
     in test mode (card 4111 1111 1111 1111, any future expiry/CVV, or UPI `success@razorpay`) → after success the
     invoice shows Paid with an Online receipt. Also the admission form payment step.
3. **Server-side forced password change** (currently frontend-only): in `backend/src/auth/auth.guard.ts`, when the
   user has `mustChangePassword`, allow only `GET /auth/me` and `POST /auth/change-password` (403 otherwise). Update
   tests that log in freshly generated parents (`test/school-year.e2e-spec.ts`, `test/admissions.e2e-spec.ts`) to
   change the password first.
4. **Full verification**: `cd backend && npx jest` (unit) and `npx jest --config test/jest-e2e.json --runInBand`
   (e2e; each test file gets its own fresh DB). Postgres: portable server in the session scratchpad
   (`infra/pg/start-pg.js`, port 55432, user erp) then
   `E2E_PG_ADMIN_URL=postgresql://erp:erp_local_only@localhost:55432/postgres node scripts/test-postgres.js`
   (run in two halves by passing test file names if memory is tight). Then `node scripts/make-postgres-schema.js --check`.
5. Reseed `dev.db` (backup first), `npx next build` with `NODE_OPTIONS=--max-old-space-size=1536`, browser pass of
   every round-3 item per role (Playwright `browser_run_code_unsafe` sweep pattern is in PROJECT_MEMORY §10).
6. Update `MODULE_ASSESSMENT.md` / `docs/OPERATIONS.md` (Razorpay env names + alias, notices, attendance rule),
   log in `PROJECT_MEMORY.md`, then — only if the owner asks — commit (no watermark) and push
   `jayanth/feedback-round-1`.

## 7. Gotchas that cost time before
- `prisma migrate diff --shadow-database-url file:./x.db` leaves `backend/shadow*.db`; delete them or the next diff fails.
- Every schema change needs BOTH migrations: SQLite (`prisma/migrations`) and Postgres (diff the previous
  `prisma/postgres/schema.prisma` → new, into `prisma/postgres/migrations`), then `node scripts/make-postgres-schema.js`.
- SQLite runs with WAL + one connection + queued transactions (`prisma.service.ts`); never call `this.prisma.*`
  inside an interactive transaction callback (use `tx`) or it waits forever.
- Tenant layer: `common/request-context.ts` + `prisma/tenant-extension.ts` scope every top-level query to the
  caller's school; still call `assertInBranch` for body ids.
- Stopping a background shell on Windows does NOT kill its `next start` / `node dist/src/main` child — kill by port.
- `table.data-table thead th { text-align:left }` is unlayered CSS; use `th-end` for right-aligned headers.
- Frontend component classes (`.btn`, `.field`, `.card`) are unlayered and beat Tailwind utilities.
- Running `next build` while `next dev` is up corrupts `.next`. Low memory: background servers get killed when idle.
- `backend/.gitignore` storage rule must stay `/storage/` (a bare `storage/` once hid `src/storage/` from git).
- PostgreSQL databases must be UTF-8.
