# PROJECT MEMORY — Genesis ERP (Sainik School ERP)

> Living memory file. Updated by the agent at **every work milestone** (a wall-clock
> "every minute" timer isn't possible inside a coding session — milestone updates are
> the reliable equivalent; this file is the single source of truth for any future session).

## 1. What this project is
School ERP (Sainik School / Genesis Lumia) migrated from React/Vite + Hono/D1 to:
- **Frontend:** Next.js 15 + Tailwind, port 5173, `/api/*` rewritten to backend (`BACKEND_URL` env)
- **Backend:** NestJS 11 + Prisma + SQLite, port 3001, global prefix `/api`, Swagger at `/api/docs`
- Working dir: `C:\jay\projj\genesiserp-master` (Windows, bash shell — use POSIX syntax)
- Node v24. Backend installs use `--legacy-peer-deps`.

## 2. Source of requirements
`plan.txt` (repo root) = extracted `School_ERP_Full_Delivery_Plan (3).pdf` — 14 modules, phases 0–11.

## 3. Current status (updated per milestone)
- **PASS COMPLETE: all 13 modules end-to-end.** Backend + frontend build clean; **e2e 84/84 green,
  idempotent (verified on consecutive re-runs)**.
- Gap-closing pass delivered: spec roll numbers `[CLASS][YEAR][SEQ]` (collision-safe), balanced
  house allocation, public token parent form (`/admission-form?token=`), printable admission
  letters & fee receipts (`RCPT-`/`INV-` sequential numbers), TRUE all-records attendance %,
  monthly attendance register (API+UI), env-configurable notification dispatch
  (`NOTIFY_WEBHOOK_URL`, honest `mocked` status), yearly leave balances (API+UI), incident
  parent SMS, CSV exports (API+UI), hostel move audit trail, payroll auto unpaid-leave pull.
- CBT: engine complete (server-authoritative timing, auto-grade, manual grading queue) —
  student-facing countdown UI explicitly EXEMPTED by user.
- Deliverables: `MODULE_ASSESSMENT.md` (v2), `Genesis_ERP_Module_Workbook_v2.xlsx`
  (regenerate: `python scripts/generate_module_workbook.py`; v1 filename locked by Excel, script now writes _v2).
- **UI: site-wide motion pass COMPLETE** — every one of the 17 routes now uses the shared kit
  (`PageHeader`, `Reveal`, `Card`, `StatCard`, `Tabs`, `Badge`, `Button`, `Field`, `EmptyState`,
  `Skeleton`, `ProgressBar`, `useToast`). No hand-rolled legacy Tailwind markup remains.
- **Hardening pass COMPLETE** — see milestone log. Backend: real rate limiting (the previous
  ThrottlerGuard was never applied, so it did nothing), real CORS allowlist (previously every
  branch returned `true`), helmet, global exception filter, fail-fast JWT/CORS in production,
  class-validator DTOs on money/safeguarding writes, 24 models indexed (schema had ZERO indexes —
  every non-unique filter was a full scan). Frontend: favicon, per-route titles/descriptions,
  404 + error boundary, mailto/tel links, horizontal-scroll fixes.
- **Tests: 84 e2e + 21 unit = 105, all green.**

## 4. Credentials & seed (branch `sainik01`)
| login | password | role |
|---|---|---|
| admin@sainik01.edu | Admin@123 | super_admin |
| principal@sainik01.edu | Demo@Principal1 | branch_admin |
| teacher@sainik01.edu | Demo@Teacher1 | teacher (linked to staff t_rajesh) |
| warden@sainik01.edu | Demo@Warden1 | warden |

Seed IDs: classes `cls_10a/cls_10b/cls_12_sci`; students `stu_001–004`; subjects `sub_eng/hin/mat/sst/sci`; staff `t_rajesh/t_meera/t_arjun/t_kavya`; exams `ex_1/ex_2`.

## 5. Architecture conventions (must follow)
- **Frontend design system (v2):** tokens in `src/app/globals.css` (`@theme` block; Tailwind v4 CSS-first,
  no tailwind.config.ts). Component primitives `.btn*`, `.card`, `.field`, `.badge`, `.table-head` are defined
  there — Tailwind v4 CANNOT `@apply` custom component classes (compose via grouped selectors instead).
  React-side primitives live in `src/components/ui.tsx` (Reveal, AnimatedNumber, Card, StatCard, Button,
  Badge, Tabs, Field/Input/Select, Skeleton, EmptyState, ProgressBar, ToastHost/useToast, Icon).
- **Converting a page to the kit:** import from `@/components/ui`; hand-rolled `<h2>`+`<p>` → `PageHeader`
  (icon = module name); wrap sections in `Reveal` (add `delay` for stagger) or give a tab panel
  `style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}` + a `key` so it replays;
  status pills → `Badge tone=…`; inline `message`/`alert()` → `setMessage` + a `useEffect` that
  calls `toast.push` (regex `/fail|error|required|invalid/i` picks the error tone); numbers → `tnum`.
- `.field` sets `w-full`, so inline filter controls need `field w-auto` (bare `.field` stretches).
  `flex-1` + `field w-auto` conflicts — use `field flex-1`.
- Every `<select>` needs an `aria-label` (or a `<Field>` wrapper) to have an accessible name.
- Controllers: `type ReqWithUser = { user: { sub: string; role: string; branch_id: string } }`,
  `@UseGuards(AuthGuard, RolesGuard)`, `@Roles(...)` for restricted writes, snake_case body fields.
- **Security rules added:** `ThrottlerGuard` is registered via `APP_GUARD` in `app.module.ts` —
  removing it silently disables ALL rate limiting. Login additionally carries
  `@Throttle({ auth: { limit: 10, ttl: 60_000 } })`. CORS allowlist comes from `CORS_ORIGINS`;
  `NODE_ENV=production` refuses to boot without it, and without `JWT_SECRET`
  (`resolveJwtSecret` in `auth/jwt-secret.ts`). `helmet` is on with CSP disabled only because
  Swagger needs inline scripts — re-enable CSP once `/api/docs` is authenticated.
- **DTO pattern:** controllers used to take inline anonymous `@Body()` types, which made
  `whitelist: true` in the global ValidationPipe a silent no-op. Write endpoints now take real
  classes from `*.dto.ts`. `@MaxLength` on an ARRAY checks the array length — use `@ArrayMaxSize`
  (this bug broke attendance until it was caught).
- `AllExceptionsFilter` (`common/`) normalises every error to
  `{statusCode, error, message, path, timestamp}` and stops leaking SQL/stack traces.
- Unit tests run with plain `npx jest` (rootDir `src`, `*.spec.ts`); e2e with
  `npx jest --config test/jest-e2e.json`. Unit specs importing DTOs **must** `import 'reflect-metadata'`
  or `Reflect.getMetadata` is missing. Only `testRegex: ".e2e-spec.ts$"` runs under the e2e config.
- **User↔Staff:** JWT `sub` is a User id. Staff-FK fields (`collector`, `reportedBy`, `approver`)
  must be resolved via `prisma.staff.findFirst({ where: { user: { id: sub } } })`; admins may have no staff row.
- **Route order matters:** literal sub-routes (`salaries`, `payslips`) MUST be declared before `@Get(':id')`.
- ConflictException when `err.message.includes('Unique constraint')`.
- Prisma models are camelCase fields + `@map("snake_case")` columns; SQLite datasource `file:./dev.db`.
- Frontend pages: `frontend/src/app/(dashboard)/<module>/page.tsx`, `"use client"`, `apiFetch` from `@/lib/api`.
- e2e: `backend/test/api.e2e-spec.ts`, 84 tests, idempotent `beforeAll` cleanup of all test-created rows (persistent dev.db!),
  run with `npx jest --config test/jest-e2e.json --runInBand` from `backend/`.
- Build check: `npm run build` may exit 0 with TS errors in tail — grep for `error TS`.

## 6. Gotchas learned (do not rediscover)
- `write_file` tool corrupts files if called twice concurrently — prefer `str_replace` for edits.
- Frontend `(dashboard)/academics` uses `topic`/`date` for lesson plans; assignments POST requires `teacher_id`.
- Prisma schema deprecation warning about `package.json#prisma` is harmless.
- The UI conversion was largely mechanical class-name swaps; done via `scripts/ui_motion_codemod.py`
  (idempotent, 3 passes: primitives → list rows/tabs/links → aria-labels) rather than 13 rewrites.
  Re-run it only after re-adding legacy markup; it will not double-apply to converted pages.
- `npx tsc --noEmit` in `frontend/` is much faster than `npm run build` for catching TS errors —
  use it while iterating, then confirm with a real build before reporting done.
- Every dashboard page is `"use client"`, so Next's `export const metadata` is unavailable
  per-route. Titles/descriptions are set from `components/RouteMeta.tsx` via `useRouteMeta(pathname)`
  — add new routes to the `TITLES` map there.
- `.card table { min-width: 40rem }` in globals.css + `overflow-x-clip` on html/body are what
  stop wide data tables producing a page-level horizontal scrollbar. `min-w-0` on the flex
  `<main>` is required too, or tables re-inflate the row.
- Prisma index additions live in `scripts/add_prisma_indexes.py` (idempotent). Verify an index
  actually helps with `EXPLAIN QUERY PLAN` — look for `SEARCH ... USING INDEX`, not `SCAN`.
- Backend `dist/src/main.js` is the prod entry (`start:prod`).

## 7. Milestone log
- [x] Migration to Next+Nest complete (48 e2e)
- [x] 13-module implementation pass (73 e2e)
- [x] Assessment v1 + workbook v1
- [x] "Fully ready-made" gap-closing pass (84 e2e, idempotent ×2)
- [x] Assessment v2 + workbook v2 + final reality statement
- [x] **UI redesign v2**: Tailwind v4 `@theme` design tokens + motion library (globals.css),
  shared animated UI kit (`src/components/ui.tsx`: Reveal on scroll, count-up numbers, cards,
  buttons, badges, fields, toasts, skeletons, SVG icon set), grouped animated sidebar + glass
  header in DashboardShell, route transitions via `(dashboard)/template.tsx`, real animated home
  dashboard (replaced the old redirect), rebuilt Reports page, restyled Login (demo quick-fill),
  upgraded Students page. Accessibility: reduced-motion honoured, focus-visible rings, aria-live
  toasts, tabular numerals, 44px targets, no emoji as icons.
- [x] `REQUIREMENTS_DOCUMENT.md` — plain-English spec for non-technical readers (13 modules,
  roles, workflows, business-rule table, honest "not included" list, glossary).
- [x] **Site-wide motion pass** — all 12 remaining module pages (fees, hostel, staff, cbt, discipline,
  leaves, academics, attendance, timetable, exams, admissions, notifications) + the public
  `admission-form` + `ProtectedRoute` loader converted to the animated kit. Added an animated
  `Tabs` segmented control to `ui.tsx` and gave `DashboardShell` a per-item nav stagger.
  Added KPI `StatCard` rows and progress bars to 8 pages, skeletons + staggered `Reveal` lists to
  notifications, ambient orbs + completion pulse + fill-progress bar to the public parent form.
  Verified: `tsc --noEmit` clean, `next build` 20/20 pages, backend e2e 84/84 unchanged.
- [x] **Hardening pass (the "27 things" list, triaged honestly)** — 2 were N/A and explained
  (no raster images exist, so nothing to compress; lists already had empty states).
  Two turned out to be REAL BUGS, not polish: (a) `ThrottlerModule` was configured but
  `ThrottlerGuard` was never applied, so rate limiting did nothing at all; (b) the CORS
  allowlist returned `true` in every branch including the fallback, so it allowed everything.
  Also fixed: hardcoded JWT secret fallback that would have applied in production.
  Added helmet, a global exception filter (no more leaking SQL/stack traces), class-validator
  DTOs on money + safeguarding writes, 24 models indexed (schema previously had ZERO indexes),
  `frontend/.env.example` + `backend/.env.example` + gitignore fix, favicon, per-route
  metadata, 404 page, error boundary, mailto/tel links, mobile overflow fixes.
  Added 21 unit tests (exception filter, DTO validation, JWT secret resolution).
  Verified: backend build 0 errors, e2e 84/84, unit 21/21, frontend build 21/21 pages.
