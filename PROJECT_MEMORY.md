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
> **SUPERSEDED 2026-10-22 — see §9 "Final state" and MODULE_ASSESSMENT.md v3.** The claims below were
> found to be inaccurate by the 2026-10-21 audit.
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
> **SUPERSEDED:** one login per role now — see `DEMO_LOGINS` in backend/prisma/seed.ts. principal@ is role
> `principal`; the all-powerful school admin is `schooladmin@sainik01.edu / Demo@Admin1`.
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
- [x] **2026-10-16 constraints audit (read-only, no code changed).** See section 8.
- [x] **2026-10-16 Navy theme (Jayanth's spec) applied site-wide.**
  - Tokens (`globals.css @theme`): brand = navy ramp (700 #142B4A primary, 600 #1D3B60 hover,
    900 #0B1F3A deep, 500 #315A85 secondary, 50 #EAF2FB selected); accent = blue ramp
    (500 #3B82F6 focus/selected, 600 for link TEXT because #3B82F6 is <4.5:1 on white);
    ink #172B4D / ink-2 #475569 / ink-3 #64748B; line #E2E8F0, line-strong #CBD5E1;
    status base/-ink/-soft/-line per spec (ok #166534 on #ECFDF3 etc.); chart-1..5
    (navy, blue, teal, sky, gold) + `lib/chart.ts` CHART_SERIES/CHART_STATUS; radii card 12px,
    control 8px; minimal shadows. Spec-named aliases (`--color-primary` ...) live in `:root`.
  - Components: buttons 40px/8px navy; inputs #CBD5E1 border, navy focus border + blue ring;
    labels 12px/500; table head 12px/600; badges = spec status pairs; PageHeader 28px/700 navy;
    CardHead 18px/600; KPI 30px/700; Tabs active = pale blue + navy text.
  - Sidebar: Jayanth asked for a background colour -> deep navy `bg-brand-900` (#0B1F3A),
    text white/75, group labels white/50, hover white/8%; ACTIVE item stays pale blue
    (#EAF2FB) with navy text per spec. Logo sits on a white tile. "Administration portal" tag.
  - Font: Inter only — Plus Jakarta Sans removed from layout.tsx; `--font-display` = Inter.
  - `scripts/ui_theme_codemod.py` (idempotent, `--check`): 668 raw palette classes -> tokens
    + 129-line shape pass (controls rounded-lg, cards rounded-xl, input borders line-strong).
    Mapping: blue->brand, violet/indigo/purple->accent, emerald->ok, amber->warn, rose->danger,
    sky->info, slate->ink/line. Teal and slate-100/300/400 left alone (spec neutrals/chart).
  - Hand-fixed: 10 solid-navy page tabs -> pale blue; chart hexes -> tokens; login hexes
    (Google/Microsoft logo colours deliberately kept); print letter colours; avatar `??`->`||`.
  - Verified: tsc 0 errors, `next build` 22/22 (built from an isolated scratch copy), screenshots
    `.shots/theme-*.png`, 0 console errors.
  - GOTCHA: running `npm run build` in `frontend/` while `npm run dev` is up overwrites `.next`
    and the dev server 500s (`Cannot find module './611.js'`). Happened this session — fixed by
    stopping dev, deleting `.next`, restarting `npm run dev`. Build from a copy, or stop dev first.
  - **Popup bug fixed (2026-10-16).** Symptom: modals/palette opened "broken" — overlay sized to
    the page column (1120x1409 at 288,126) instead of the viewport, dialog below the fold, sidebar
    + header not dimmed. Cause: an ancestor with `transform` / `backdrop-filter` becomes the
    containing block for `position: fixed`. Culprits: `animate-page-enter` (fill-mode `both` left
    `matrix(1,0,0,1,0,0)`) on template.tsx AND DashboardShell (double animation), `useReveal`
    settling on `translate3d(0,0,0)`, and the header's `backdrop-blur-xl` (clipped Ctrl+K palette to
    a 1168x108 strip). Fix: new `Portal` in ui.tsx (renders into body) used by `Modal`, the
    Students form, Staff drawer + form, Discipline audit log and CommandPalette; page-enter uses
    `backwards`; useReveal settles on `none`; shell's duplicate page-enter removed.
    RULE: every new overlay goes through `<Portal>`. Verified all 6 overlays = viewport size,
    including 80ms into the opening animation.
  - **Collapsible sidebar (2026-10-16).** The header ☰ now collapses the desktop sidebar to a 76px
    icon rail (titles as tooltips, group dividers, badge pinned to icon) and opens the drawer on
    mobile. Persisted in localStorage `sidebar_collapsed` ("1"/"0"). Collapsed classes are all
    `lg:`-prefixed so the mobile drawer always shows labels.
  - GOTCHA (Tailwind v4): component classes in globals.css (`.btn-*`, `.field`, `.card`) are
    UNLAYERED, so they beat layered utilities — `lg:hidden` on an `IconButton` did nothing (the ☰
    showed on desktop and was dead). Don't rely on utilities to override display/padding of those
    classes; moving them into `@layer components` is the real fix (not done yet — affects every page).
  - **Table ⇄ Card view on every table (2026-10-16).** `components/TableView.tsx` wraps a
    `<table>` and adds a "Table | Cards" toggle + record count. Card view restyles the SAME rows
    via `.as-cards` CSS (globals.css) — no duplicated row markup, so actions/badges/inputs keep
    working. TableView writes `data-label` (from thead) + `data-role` on each cell:
    title (first col, or `title="Name"` hint) / badge (plain "Status" badge, pinned top-right —
    a Status cell containing a select/button becomes `wide` instead) / meta (2-col label-over-
    value) / wide (contact, description, message… regex) / actions ("Actions" or unlabelled) /
    hidden (`hide=[...]`). MutationObserver re-labels when rows change. Choice saved in
    localStorage `table_view:<path>:<id>`; phones default to cards. 21 tables wrapped (ids t1..);
    skipped admissions print-letter HTML and the staff directory (has its own grid/list toggle).
    Hints set: students/academics `title="Name"`, discipline `title="Student"`.
    v1 (generic label/value rows) was rejected by Jayanth as "not good" — v2 role layout verified
    on students, fees, discipline, attendance. NEW TABLES: wrap in <TableView id="…">.
  - "Preview is still UI breaking" = the CARD VIEW itself (Jayanth confirmed). v2 had two bugs,
    fixed in v3: (1) `table.data-table tbody td` (spec 0,1,3) beat `.as-cards td` (0,1,1), so
    data-table pages (classes, notifications) kept table padding + row borders inside cards ->
    data-table rules now use `table:where(.data-table)`; (2) cells were flex-column, which split
    inline content ("12 /12", "8 students") onto separate lines -> cells are `display:block`
    with the label as a block ::before. Also: a Status cell holding a select/buttons becomes
    `wide` (discipline dropdown was crushed to "Op"); title cells keep their inner margins
    (register showed "10A01Aditya"); tables with >10 columns get `data-dense` -> 7-across tile
    grid (monthly register). Verified in browser on every table incl. tabbed ones (timetable
    master, staff payroll, attendance register) at 1440 and 820px; switching back to Table
    restores the original table. tsc 0, next build 22/22.
  - **Per-page card designs (v4, 2026-10-16).** Jayanth: Students card is good; every other page
    needs its OWN visually distinct card. Architecture: `TableView` takes optional `cards` (page-
    built JSX from the page's own data); card mode then shows it and hides (keeps mounted) the
    table. Without `cards`, the generic `.as-cards` restyle still applies (Students uses that).
    Shared kit `components/RecordCard.tsx`: CardGrid/CardEmpty/RecordCard(rail)/CardBody/
    CardFooter/CardTitle/Monogram/IconTile/StatusPill/Metric/Meter/Ring/Chip + toneFor(key)
    (stable chart-series tone per category), statusTone(status), initials(name).
    Fees = reference ("invoice": balance due hero, paid meter, class/term/due chips with
    Overdue flag, Collect button pre-fills Record Payment). Other 11 pages built in parallel by
    4 subagents with per-table briefs (roll-call tile, heat card, payslip, quota rings, incident
    report, message card, period card, swap card, subject tile, question bubbles, result ring,
    form-field preview, applicant pipeline, month ledger, grade tile).
    DONE + verified in browser (every page incl. tabbed tables, empty states): 20 custom card
    views across fees, attendance(2), classes(3), staff payslips, leaves, discipline,
    notifications, timetable(3), academics, cbt(2), admissions(2), reports, exams. Students
    keeps the generic restyle (Jayanth's approved look). Lead fixes after review: admissions
    field grid min 16->19rem (labels truncated), CBT active tab gradient -> pale blue/navy.
    NOTE: staff payslip cards have a "Mark paid" button the payslip TABLE lacks (calls existing
    markPaid -> PUT /payslips/:id/mark-paid) — flagged to Jayanth. Admissions card shows
    "Awaiting parent" for Re-submit where the table says "Complete" (agent's deliberate fix).
    Notifications cards expose the gate-pass OTP in message previews (pre-existing security
    issue from the audit, now more visible). tsc 0, isolated next build 22/22.
  - **Fix round (2026-10-16, afternoon)** — Jayanth: roster popup, students actions, table
    alignment, "where do I preview a generated timetable".
    - Students table: was 49px wider than its container, so the Actions column sat OFF-SCREEN
      and its buttons were also `opacity-0` until hover → effectively invisible. Now: nowrap on
      short values, px-3 cells, emails truncated (title = full), actions always visible as
      icon buttons (edit / lock=deactivate, only for Active / trash) with aria-labels; on cards
      `.row-action-label` (globals.css) shows the words. Verified table 1119 == container 1119.
    - Wrong icons from the old lucide codemod (names exist, meaning wrong): phone was `print`,
      email/adm-no `spark`, Edit `x`/rotated `plus`, pagination `menu` rotated. Fixed on
      students. Other pages may have the same mis-mappings — grep `name="spark"`/`"print"`.
    - Roster popup: size lg, summary strip (enrolled / active / per-house counts), house chips
      coloured via houseTone, initials avatars, mono roll/admission. Search icon padding needed
      `!pl-9` (the unlayered `.field` padding beats utilities — same quirk as before).
    - Timetable: new `components/WeekGrid.tsx` (days × periods, subject colour via toneFor,
      times from period config). Master Grid tab shows it on top of the list. Auto-Generator now
      loads the saved timetable after a successful run and shows "Preview — <class>" with
      "Open in Master Grid". Generate was NOT clicked in testing (overwrite:true would replace
      Class 10 A's demo timetable); preview uses the same component + data as Master Grid.
    - DATA BUG found: period 3 is configured as "Short Break" but the generator schedules
      lessons into it. WeekGrid shows those rows with a "⚠ Short Break slot" marker rather than
      hiding them. Generator should skip isBreak periods — not fixed yet.
    - ANOTHER DEV/SESSION edited the tree 14:43–14:58 while I was paused: added
      `components/motion/AnimatedCards.tsx` (TiltCard/SpotlightCard/BorderBeam/StaggerItem,
      ported from Spectrum UI Apache-2.0 + border-beam MIT), used on dashboard + fees; edited
      globals.css (border-beam), TableView.tsx, students, fees, dev.db. My fixes survived; I
      built on top, did not revert. A transient /timetable 500 was a mid-recompile.
    - Free RAM was ~0.6 GB: skipped production builds this round; tsc 0 errors + browser checks.
  - **School requirements template (2026-10-16).** `Genesis_ERP_School_Requirements_Template.xlsx`
    (repo root), generated by `python scripts/generate_requirements_template.py`. 17 sheets:
    Start Here (instructions, colour key, live progress tracker per section, hyperlinks) +
    1 Profile, 2 Modules (14 prefilled), 3 Classes, 4 Subjects, 5 Staff & ERP roles,
    6 Timetable (rules + bell schedule), 7 Fees, 8 Admissions, 9 Hostel, 10 Attendance & Leave,
    11 Exams, 12 Grading, 13 Notifications (11 events prefilled), 14 Existing Data, 15 Reports,
    16 Questions & Sign-off. Light-blue = school fills, gold row = example, dropdowns with
    warning-style validation (own answers allowed), Arial, navy theme, print-ready.
    Return-to contact set to `RETURN_TO` constant (Jayanth · jayanth.m@ncetmail.com).
    VERIFY NOTE: the xlsx skill's recalc.py fails on Windows (no AF_UNIX) and LibreOffice is
    not installed — recalculated via Excel COM instead: 66 formulas, 0 errors, tracker
    smoke-tested (fills → "1 of 34 answers / In progress", cleared → "Not started").
  - Not changed (design call for Jayanth): page-level tinted KPI tiles on staff/attendance
    (blue/green/amber backgrounds) — spec prefers white cards.

## 8. Constraints audit — 2026-10-16 (supersedes stale claims above)
**Upstream:** PR #1 (Prashanth, f0fd50b, merged by Shishira 2026-10-12) landed AFTER this file's
last update. It added `auth/signup` + `auth/sso`, Prisma migrations (`20261003155121_init`, in sync by
count: 38 tables / 42 idx / 17 unique), rewrote seed + 9 pages, added recharts/lucide charts &
motion components. Local uncommitted work (UI v3: tokens codemod, `lib/nav.ts`, new `classes/` and
`settings/` routes, hand-rolled SVG charts) then DELETED Prashanth's charts/motion/`ui/*` and dropped
recharts + lucide-react. Untracked files are required by modified tracked ones — commit them together.
`origin/prashanth` has nothing not already in main.
**Baseline verified 2026-10-16:** backend + frontend `tsc --noEmit` 0 errors; unit 21/21; e2e 84/84.
**Security — verified in code, OPEN:**
- `POST /auth/sso` issues a token for ANY existing email with no password (log in as admin@ by email).
  Unknown emails auto-provision as teacher. (Prashanth's PR.)
- `POST /auth/signup` accepts any `role` string incl. `super_admin`; joins first branch. (Prashanth's PR.)
- `@Throttle({ auth: ... })` is a NO-OP — no throttler named `auth` is configured in
  `ThrottlerModule.forRoot`. Login brute-force limit is really the global 300/min. This was OUR bug
  from the hardening pass (section 3/5 claims above were wrong).
- Admissions controller has AuthGuard only — any logged-in user can approve/allocate/create students.
- Cross-branch writes via unique-key upserts (exams marks, attendance, timetable slot/generate,
  substitutions, hostel auto-allocate) + body FK ids never branch-checked.
- ~60 inline `@Body()` types bypass ValidationPipe; `forbidNonWhitelisted: false`.
- Gate-pass OTP via Math.random, returned by GETs and stored in notification logs readable by all roles.
- Admission parent passwords stored/returned in plaintext; public tokens never expire / resubmittable.
- Salaries/payslips/fee reports/CSV exports readable by every role. Swagger exposed in prod.
  `NOTIFY_WEBHOOK_SECRET` hardcoded fallback. No CSP/HSTS from Next; JWT in localStorage.
- Roles in code: super_admin, admin, branch_admin, teacher, warden, principal — seed has no `admin`
  or `principal` user, so those code paths are untested.
**Functional bugs:** Reports CSV export uses raw `fetch` with no Bearer token and no `res.ok` check →
downloads the 401 JSON as .csv and toasts "exported ✓" (in HEAD too). CBT grading ignores earlier
manual grades. Exams page hardwired to `stu_001`. No global 401 → login redirect. Page-enter animation
runs twice (template.tsx + DashboardShell). `npm run lint`/`clean` broken (no eslint, no rimraf).
**Data:** rewritten `seed.ts` WIPES all `sainik01` branch data first, no NODE_ENV guard. e2e runs
against the persistent dev.db. Docs say `prisma db push`; scripts use `migrate dev/deploy`.
**Untested new endpoints:** notifications/broadcast, reports/trends, reports/exam-scores, class dedup.
**Docs:** MODULES_DOCS, features_documentation, DEMO_GUIDE, docs/*, migration_plan describe the old
Hono/D1 stack and are stale. Authoritative: REQUIREMENTS_DOCUMENT, MODULE_ASSESSMENT, this file.
Security audit marks CSP/HSTS and auth throttling "PASSED" — not true in code. License Apache-2.0;
AUTHORS credits Stepvista.

## 9. Phase-completion pass — 2026-10-21 (Jayanth: "check all phases, roles, limitations; build what's missing; tell me reality")
**Plan PDF has Phases 0–11 (12 phases); there is no "Phase 12".** Audit (3 read-only agents) found
MODULE_ASSESSMENT v2 badly overstated: 3 of ~13 plan roles existed, zero frontend RBAC, public signup
as super_admin, password-less SSO, admissions had no role checks and the UI stalled at "Pay Fee",
gate-pass OTP leaked, salaries readable by teachers, many features with no UI/API.
**Baseline on arrival:** tsc clean both sides, unit 21/21, **e2e 0/84** (beforeAll FK crash on dev.db leftovers).
### Stage A (foundation, done by lead)
- e2e now builds its own `prisma/test-e2e-<pid>.db` from migrations+seed every run
  (`test/e2e-global-setup.ts`, `e2e-env.ts`, `e2e-global-teardown.ts`). dev.db is never touched by tests.
- Migration `20261021120000_phase_completion` (generated via `migrate diff`, applied with `migrate deploy`).
  dev.db had no migration history (was `db push`) → baselined with `migrate resolve --applied 20261003155121_init`.
  Pre-migration dev.db backup in session scratchpad. Row counts verified identical after migrate.
  New: ParentStudent, AdmissionStep, PaymentOrder, GradeBand, HostelRollCall; User(name,isActive,
  mustChangePassword,studentId); Admission workflow fields (expiry, reminders, payment, receipt, signature,
  studentId) and **plaintext `password` column dropped**; Exam(term, academicYear, weight, maxMarks);
  GatePass(actualOutTime, checkedOut/InBy, rejectedReason, passCode; parentOtp = sha256 hash);
  Incident(severity, assignedTo, escalatedAt/By, deletedAt); Staff(department, phone); bedLabel on
  HostelAllocation; CbtAttempt(status, grades JSON, startedAt, submittedAt nullable); AdmissionDocument
  admissionId nullable + studentId (DMS archive).
- `auth/roles.ts` = single source of roles + groups `R.*`. 16 roles incl. parent/student.
- Auth: public signup + SSO REMOVED. Admin user mgmt `GET/POST/PUT /auth/users`, `POST /auth/change-password`,
  `/auth/me` returns profile + children. Login accepts login IDs (not just emails), real 10/min throttle
  (`@Throttle({default:...})` — the old named `auth` throttler never existed). AuthGuard now loads role,
  branch and isActive from DB each request (role changes / disabling are immediate).
- `common/access.ts`: assertInBranch, assertRoomInBranch, currentStaffId, portalStudentIds,
  assertCanSeeStudent, audit. Notifications: `redact` masks secrets in logs; no hardcoded webhook secret.
- Seed: one login per role (see DEMO_LOGINS in seed.ts; principal@ is now role `principal`,
  `schooladmin@sainik01.edu / Demo@Admin1` is branch_admin), parent@ (stu_001+stu_004), student@ (stu_001),
  second school `greenfield02` for isolation tests, grade bands, production guard.
- Legacy e2e logs in as schooladmin@ now (was principal@ which used to be secretly branch_admin). 84/84.
- A stale backend (pid from 2026-10-17) holds port 3001 and the Prisma engine DLL → `prisma generate`
  EPERM on the DLL (types still regenerate). Restart it before browser testing.
### Stage B (7 parallel builder agents, disjoint file ownership — brief in session scratchpad BRIEF.md)
Admissions+payments · SIS/fees/notifications/classes · attendance+timetable · leaves+gate pass+discipline ·
academics/exams/reports · hostel/staff/CBT · frontend RBAC shell + login + settings + home + parent/student portal.
Lead pre-built for them: `frontend/src/lib/auth.tsx` (MeProvider in (dashboard)/layout, useMe/hasRole/R/ROLE),
global 401→/login in `lib/api.ts`, `apiDownload()` (authenticated file download), `backend/src/common/pdf.ts`
(buildPdf/sendPdf, unit-tested), empty PaymentsModule/PortalModule registered in app.module.
Deps installed once by lead: pdf-lib 1.17.1, exceljs 4.4.0, qrcode 1.5.4 (+@types), @nestjs/schedule 6.0.1.
`LOGIN_RATE_LIMIT` env (default 10; e2e-env sets 1000 so suites can log in every role).
### Stage C infra (lead)
- `GET /api/health` (DB ping, public, unthrottled); request-logger middleware (request id header, JSON lines
  in prod, warn >1s, error 5xx); Swagger OFF in production unless SWAGGER_ENABLED=1; `rawBody: true` for webhooks.
- `backend/Dockerfile`, `frontend/Dockerfile` (BACKEND_URL is a BUILD arg — Next bakes rewrites at build),
  `docker-compose.yml` (api + web + daily backup sidecar), `.dockerignore`s.
- `.github/workflows/ci.yml`: migrations-vs-schema drift check, tsc, unit, e2e, nest build, next build.
- `backend/scripts/backup-db.js` (`npm run backup`): VACUUM INTO + integrity_check + retention. Tested OK.
- `backend/scripts/load-test.js` (`npm run load-test`): two schools + portal users concurrently, p50/95/99,
  isolation leak detection on every response body. Not yet run (needs a running server).
- `.env.example` documents all new env vars.
- **Leaves/gate pass/discipline (agent, 28/28 own suite):** approvedBy on Staff/StudentLeave = Staff id or null
  (then remarks start "Decided by <name> (<role>)"; user id in audit log). Gate-pass actor columns = Staff id or
  `user:<id>`. OTP: crypto.randomInt, sha256 stored, sent with redact, checked at CHECKOUT (5 tries lock), never
  returned. passCode + pass.pdf with QR. Safeguarding: `discipline/safeguarding-access.ts` is the only access path;
  case team = R.SAFEGUARDING (branch_admin deliberately excluded); all staff can report + see `/incidents/mine`;
  every LIST/VIEW/write audited; soft delete only. New statuses: Withdrawn/Cancelled (leaves), Rejected (gate pass),
  Escalated (incidents). Legacy tests broken BY DESIGN: discipline lifecycle, gate-pass OTP lifecycle, hostel
  audit-log read — lead to update; hostel needs a non-safeguarding audit viewer.
- **SIS/fees/notifications/classes (agent, 32/32 own suite):** doc numbers now `INV-<BRANCHCODE>-<YEAR>-NNNN` /
  `RCPT-…` via `fees/doc-no.ts` (nextDocNo + withDocNoRetry, per-branch, transactional; payments must reuse it).
  Payments transactional (10 concurrent → no overpay). Students "Left" via status; hard DELETE only when no history (409).
  Contacts hidden from teacher/HOD/security (`contacts_hidden`). New `/students/:id/profile` + `students/[id]` page,
  TC/ID-card JSON+PDF, invoice/receipt PDFs, `/fees/defaulters`, `/notifications/mine`, legacy OTP/password masked on read.
  Legacy INV/RCPT regex test broken BY DESIGN (lead to update). RouteMeta needs `/students/[id]` title.
- **Academics/exams/reports (agent, 28/28 own suite):** grade engine `exams/grading.ts` (weighted subject %, band
  lookup, CGPA-style GP, 1-2-2-4 rank); report cards computed live (not stored), JSON + PDF + class combined PDF;
  exam CRUD, grade-band CRUD, bulk marks with branch/class/bounds/timetable-teaching checks; academics snake_case
  DTOs, teacher self-only, syllabus progress; reports role-split (fees→R.FEES_READ, payroll→R.PAYROLL which
  INCLUDES accounts per plan "Payroll … for Accounts/HR"), filters class/section/from/to, export csv/xlsx/pdf on
  every report (audited), in-process TTL cache (NOT Redis; X-Cache header; ?fresh=1). Hardcoded KPIs removed.
  CSV now has BOM + CRLF. Something is listening on :3000 returning 404 for dashboard routes — investigate.
- **Admissions + payments (agent, 21/21 own suite):** `admissions/workflow.ts` transitionAdmission() = only way to
  change status (409 illegal / 403 wrong role / 400 missing remarks, AdmissionStep row, optimistic status check).
  Extra statuses 'Link Expired', 'Rejected'. Templates per year (OS approve/reject), trigger-links creates parent
  User `p######` (hashed, mustChangePassword), password returned once + redacted. Public form 404/410/409,
  template-validated. Principal sign-off transaction → Student + docs archived + ParentStudent. Staff `:id/submit`
  REMOVED (parent submits). Reminders = in-process @nestjs/schedule cron 09:00 IST (NOT BullMQ; would double-run
  on multiple instances). Payments: server-priced orders, Razorpay HMAC over rawBody, mock gateway dev-only,
  invoice payments reuse fees/doc-no.ts. 11 legacy admissions tests broken BY DESIGN.
- Lead: JSON body limit raised to 8mb in main.ts (default 100kb would 413 every real document upload).
- **Hostel/staff/CBT (agent, 23/23 own suite, stable x3):** beds B1..Bn, transactional allocation + unique
  (roomId,bedLabel) → race-safe; roll-call (pre-fills On Leave from leaves/gate passes, night Absent SMS);
  `/hostel/my` for portal. Staff directory never returns salary; `/staff/me`, `/staff/me/payslips`, payslip PDF
  (own only unless R.PAYROLL); unpaid days = Unpaid leave + over-quota leave (`staff/payroll.ts`), validated
  overrides; Draft→Generated→Paid. CBT: answer key authors-only; student-only start/answers/submit with
  server deadline min(startedAt+dur, startsAt+dur), autosave, single submit, auto-submit past deadline,
  merged per-question grades, grading queue; player at `cbt/take/[id]`.
- **Attendance/timetable (agent, 16/16 own suite):** teacher/HOD scoped to classes they teach (no class-teacher
  field exists); markedBy from caller; absence auto-notifies parent; calendar/absentees/low endpoints; % counts
  Present+Late. Generator skips breaks + respects max/day across classes; conflict engine = slots + Assigned
  covers + approved leave + invigilation; substitution Requested→Assigned→Cancelled with suggest; substitute
  emailed, class gets a `channel='notice'` log row. Requested rows store original teacher as placeholder
  substitute (column NOT NULL) — count covers with status='Assigned' only.
- Lead: `common/leave-quotas.ts` single LEAVE_QUOTAS (was duplicated in leaves + payroll). `GET /api/audit-log`
  (admins + principal) = school audit trail EXCLUDING safeguarding (`incident`) rows. R.CBT_TAKE in lib/auth.
- Lead: legacy suite updated for the new contracts (11 superseded admissions tests retired after confirming
  admissions.e2e covers them; roll-number + public-form tests rewritten; discipline as discipline officer;
  gate-pass OTP via notify spy; CBT as student login; INV/RCPT regex; hostel audit via /api/audit-log;
  generator uses t_naveen). e2e now gives EVERY TEST FILE its own copy of the seeded template DB
  (run-order leaks: legacy suite rewrote the bell schedule) — `test/e2e-env.ts`.
- Lead: `test/tenant-isolation.e2e-spec.ts` — sweeps ~36 list endpoints from both schools + foreign-id
  reads/writes. GOTCHA: VS Code "Console Ninja" extension instruments console.* in jest and slows it
  massively (20MB output, transaction timeouts) — never debug e2e with console.warn loops.
- Lead: JSON body limit 8mb (main.ts); `TRUST_PROXY` + `GLOBAL_RATE_LIMIT` env (behind a proxy every user
  shared one 300/min bucket). Port :3000 on this machine = NCET-ERP frontend (other project), NOT ours.
- Browser (lead): AO create forms → parent public form → AO validate → mock pay → Accounts verify all work.
  **BUG FOUND + FIXED:** uploading a document on the public parent form wiped every typed answer
  (`load()` overwrote values) → `load({ keepValues: true })` in admission-form/page.tsx; re-verified.
  Verification servers (:3101 api, :5174 web) were stopped by the session tooling for low memory before OS/VP/Principal
  UI steps — those are covered by admissions.e2e only.
### Final state (2026-10-22)
- tsc 0/0, nest build OK, next build 33 routes, unit 22/22, **e2e 294/294 (x2)**, no migration drift,
  load test 5,564 req / 0 errors / 0 leaks / p95 427ms, backup script OK. Docs: MODULE_ASSESSMENT.md v3
  (honest phase table), docs/OPERATIONS.md (deploy/DR/monitoring/load test).
- NOT done / honest gaps: not deployed; CI never run on GitHub; Docker images not built here; no Sentry/alerting;
  SQLite not Postgres; no Redis/BullMQ (reminders = in-process cron, cache in-process); documents in DB not
  R2/S3; Razorpay untested against the real service; SMS/email need a provider; flat-rate payroll tax;
  report cards computed live; no off-site backups. Nothing committed (Jayanth didn't ask).
- Stale backend pid 34432 (2026-10-17) still on :3001 running OLD in-memory code — restart before using the app.

## 10. Round 2 — "what still not real, do all" (2026-10-22)
- Upstream checked: nothing new on origin. Stopped the stale backend pid 34432 (old dist from 10-17) — it
  locked Prisma's engine DLL. Nothing is listening on :3001 now; start it again when needed.
- Machine has NO Docker/Postgres/Redis. Portable test infra in the session scratchpad (`infra/`):
  embedded-postgres 17 (port 55432, user erp / erp_local_only, throwaway data), Redis 5.0.14 for Windows
  (tporadowski build), s3rver (devDependency) for S3. MinIO's direct download now returns 410.
- Migrations: `20261022090000_completion_round2` (Bed table + backfill: beds B1..Bn per room, all 36 seed
  allocations linked, no dup/over-capacity; Class.classTeacherId; ReportCardSnapshot; PayrollConfig; JobRun;
  SalaryStructure tax fields; Payslip.professionalTax; AdmissionDocument.dataUrl nullable + storageKey/mimeType),
  `20261022093000_notification_retries` (attempts/lastError/retryAfter). dev.db backup before round 2 in scratchpad.
- GOTCHA: `prisma migrate diff --shadow-database-url file:./x.db` leaves shadow files in backend/ — a stale one
  makes the next diff fail with "table already exists". Delete `backend/shadow*.db` after each diff.
- Postgres: `prisma/postgres/schema.prisma` GENERATED by `scripts/make-postgres-schema.js` (CI `--check`),
  own migrations in `prisma/postgres/migrations/` (init applied cleanly to real PG 17, zero drift).
  e2e harness has a PG mode (`E2E_PG_ADMIN_URL`; template DB + `CREATE DATABASE … TEMPLATE` per test file;
  `test/e2e-pg.ts`); `npm run test:e2e:pg` (scripts/test-postgres.js) swaps the client to PG and restores SQLite.
  CI job `backend-postgres` (postgres:17 service). Dockerfile `--build-arg DB_PROVIDER=postgresql`.
  KNOWN DIFF: Prisma `contains` is case-insensitive on SQLite, case-SENSITIVE on PG → needs a helper.
- Deps added: @aws-sdk/client-s3 + presigner, ioredis@5, @nest-lab/throttler-storage-redis, nodemailer,
  @sentry/node; dev: s3rver, smtp-server. load-test.js has `--writes 0.2` (attendance + invoice/payment from both schools).
- 3 builder agents (brief: scratchpad BRIEF2.md): storage (S3/R2/local + DMS per student + off-site backup),
  infra (central tenant Prisma extension + AsyncLocalStorage, JobRun lock + notification retry job, SMTP/MSG91/
  Twilio providers, Redis cache + throttler storage, Sentry/alert webhook), domain (Bed table logic, class
  teacher, Indian tax slabs FY2025-26 + PT presets, report-card snapshots per term).
- **Storage (agent, 23/23 own suite):** `backend/src/storage/` (@Global StorageModule; drivers local|s3 —
  s3 works for R2/AWS/MinIO; local signed URLs `GET /api/files/<payload>.<HMAC>`; prod refuses local unless
  STORAGE_ALLOW_LOCAL=1). Keys `branches/<b>/admissions/<app>/…` → after sign-off
  `branches/<b>/students/<sid>/documents/…` (plan: folder per student). Magic-byte check on uploads.
  Downloads return `{url, expires_at, file_name, mime_type}` (data_url only for legacy rows).
  `scripts/migrate-documents-to-storage.js` RAN on dev.db: 15/15 migrated, 0 legacy left; files in
  `backend/storage/` (gitignored); backup before at scratchpad/storage-agent/. backup-db.js uploads to
  S3 when BACKUP_S3_BUCKET set (HEAD size check, remote retention). Under NODE_ENV=test storage dir = os.tmpdir().
- **Domain (agent, 25/25 own suite + 19 tax unit tests):** hostel fully on Bed table (resize adds/retires
  beds, out-of-service beds, syncRoomBeds() repairs unlinked rooms); class teacher (classes API/UI, attendance
  scope = class teacher + timetable + covers); `staff/payroll-tax.ts` FY2025-26 new/old regime, 87A + marginal
  relief, cess, surcharge (no surcharge marginal relief), PT presets none/karnataka/maharashtra/custom, EPF
  ceiling; a salary structure sending only tds_percent stays `flat` (legacy numbers unchanged); report cards
  published → ReportCardSnapshot, portal sees published only (404 until published), staff live + "changed since
  publish". RATES FROM MODEL KNOWLEDGE — a CA must verify.
- Lead: e2e sweep race FIXED (setup deleted other runs' live templates → ENOENT/500s for concurrent runs;
  now only files untouched for 3h). Tests updated for signed-URL downloads (follow the URL, expect 200) and
  report-card publish-before-portal. Seed now creates Bed rows + bed-linked allocations (48 beds, 37 linked)
  and 8 class teachers (teacher@ = class teacher of 10 A).
- **Infra (agent, 23/23 own suite incl. real Redis):** central tenant layer = AsyncLocalStorage request context
  (`common/request-context.ts`, set by AuthGuard) + Prisma extension (`prisma/tenant-extension.ts`, DMMF-derived
  TENANT_MODELS): reads/bulk writes get AND branchId, unique ops get branchId in the unique where, foreign
  creates → 403; PrismaService is a Proxy (model delegates + $transaction scoped); `prisma.unscoped` escape
  hatch. Overhead ≈ +6-8% per query. Only top-level queries scoped (nested relation filters + raw SQL are not).
  JobsService.runOnce (JobRun lock, lease takeover) drives admission reminders + per-minute notification retry
  job (backoff 1m/5m/30m/2h, max 5; secret-bearing messages never retried). Providers: SMTP, MSG91 Flow v5 (only
  stub-tested), Twilio SMS/WhatsApp, signed webhook. Redis (REDIS_URL): report cache + throttler storage + health.
  Alerting: Sentry (SENTRY_DSN) + ALERT_WEBHOOK_URL dedup 5 min; `POST /api/telemetry/client-error` from error.tsx.
- Lead round-2 integration: ScheduleModule moved to app.module; compose/.env.example storage + backup vars;
  `common/search.ts textContains()` (PG case-insensitive search); tests updated; seed beds/class teachers.
- **Postgres VERIFIED:** full suite 366/366 on real PostgreSQL 17 (and 366/366 SQLite). PG GOTCHAS: a cluster
  initialised with a Windows code page (WIN1252) can't store "→"/"₹" → databases MUST be UTF-8 (harness creates
  `ENCODING 'UTF8' TEMPLATE template0`; portable PG now initdb `--encoding=UTF8 --locale=C`). `prisma db execute`
  wraps a transaction → CREATE/DROP DATABASE via plain `pg` (devDependency) in `test/e2e-pg.ts`; multi-statement
  strings are an implicit transaction too — one statement per call.
- **Backups on PG:** backup-db.js now does `pg_dump -Fc` + `pg_restore --list` check (PGPASSWORD, not argv).
  Restore drill: dump → empty DB → row counts identical on 11 tables. Dockerfile installs postgresql-client-17
  from the PGDG apt repo for DB_PROVIDER=postgresql (not built — no Docker here).
- **Write-load finding + fix (SQLite):** 25% writes / 30 clients → 72% of writes 500 (Socket timeout), p95 12 s.
  Cause: SQLite single writer; interactive transactions read-then-write deadlock + busy-wait sleeps. Fix in
  prisma.service.ts: WAL mode, `connection_limit=1` (SQLITE_CONNECTIONS), socket_timeout 30, and an in-process
  queue for $transaction on SQLite. After: 991 req, 325/325 writes ok, 0 errors, p95 1.8 s. GOTCHA: with one
  connection, never call `this.prisma.*` (non-tx) INSIDE an interactive transaction callback — it would wait
  for a second connection forever (use `tx`).
- **PG write-load finding + fix:** concurrent upserts on the same unique key (two people saving one roll call)
  → P2002 500s (Prisma can't do native upsert because the tenant layer adds branchId to the unique where).
  `common/retry.ts retryOnUniqueRace` on attendance, marks, hostel roll-call. After: 771/771 writes ok, p95 ~1 s.
- **School-year scenario** `test/school-year.e2e-spec.ts`: two schools concurrently run admission (every role)
  → attendance → online fee → exam + published report card (parent) → CBT (student login, graded) → payroll +
  mark paid; cross-checks isolation. Passes on SQLite and Postgres.
- Browser (lead, prod build): VP approve → Principal digital sign → Admission Complete + student + letter PDF;
  CBT player (countdown, autosave, refresh-safe, leave guard, submit confirm) + HOD grading queue → 5/5 visible to
  student; security desk; hostel bed map (37/48). FIXED: CBT open/close showed 5h30 apart (zone-less start time) —
  `common/school-time.ts parseSchoolTime` (TZ_SCHOOL, default Asia/Kolkata) used by CBT; FE formats both via Date.
  FIXED: hostel page called /api/staff for wardens (403 noise) → only with R.STAFF_DIRECTORY.
- Killed stale processes (this project only): nest --watch from 2026-10-16 (pid 9328, 846 MB, served nothing)
  and my orphaned :5174 next dev. :3000 is NCET-ERP — untouched.
- Lead, final round 2: browser sweeps via `browser_run_code_unsafe` (one Playwright script per batch: login,
  visit every nav link, record non-2xx /api responses + "access denied" + console errors) — 18 logins, ~200 page
  loads, clean after fixing: Classes page called /reports/attendance for HR/safeguarding (gate on R.REPORTS +
  R.ATTENDANCE_MARK); "My payslips" called /staff/me for logins without a staff row (use session.staff).
  GOTCHA: stopping a background shell does NOT kill its `next start`/`node dist/src/main` child on Windows —
  kill by port (check the command line contains genesiserp-master) before restarting.
- **Final (2026-10-22):** unit 51/51; e2e 366/366 on SQLite AND 366/366 on PostgreSQL 17; both apps tsc 0 and
  production builds OK; no migration drift. MODULE_ASSESSMENT.md v4 + docs/OPERATIONS.md rewritten.
  Still not real (needs Jayanth): deploy, push (CI never run), Docker images never built, real Razorpay/MSG91/
  Twilio/S3/R2/Sentry accounts, CA check of tax rates, school sign-off on role decisions. Nothing committed.
- **Commit (2026-10-22):** branch `jayanth/phase-0-11-completion` (Jayanth has no branch on this repo; main is
  shared via PRs), commit 8c1138c, 265 files, no watermark (doctrine), secret scan clean. CAUGHT before push:
  backend/.gitignore `storage/` also ignored `src/storage/` (module source) → anchored to `/storage/`; root
  .gitignore now ignores .playwright-mcp/, .qoder/, .shots/. PUSH REJECTED: gh token (jayanth-torii) lacks the
  `workflow` scope needed to push .github/workflows/ci.yml → Jayanth must run
  `gh auth refresh -h github.com -s workflow`, then `git push -u origin jayanth/phase-0-11-completion`.
