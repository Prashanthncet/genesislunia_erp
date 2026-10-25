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

## 11. Round 3 — client feedback (2026-10-24), branch `jayanth/feedback-round-1`
- Upstream on arrival: PR #2 (my phase-completion branch) MERGED to main; commit b02823a (Jayanth) DELETED
  `.github/workflows/ci.yml` to push without the gh `workflow` scope → CI no longer runs. Re-add once the
  token has `workflow` scope (`gh auth refresh -h github.com -s workflow`).
- dev.db is still on the OLD seed (4 logins, principal@ = branch_admin) — migrations applied but never reseeded.
  Reseed (with backup) before demoing.
- School decisions (Jayanth, 2026-10-24): Teacher and Warden stay SEPARATE logins; Warden = hostel + gate desk +
  pass records + student list; Security = gate desk + visitors only (both keep self-service + incident report);
  OD = On Duty, counts as present, mandatory reason, no absence SMS; "Jayantha attendance" = a specific person's
  attendance looked wrong — nobody named Jayantha in seed or dev.db (reviewer's own data) → audit attendance maths.
- Lead: `R.ACADEMIC_STAFF` (staff minus warden/security) backend + frontend, applied to classes/timetable/academics/
  exams reads + nav; security removed from STUDENT_READ; nav Hostel → R.HOSTEL_ADMIN. Tests updated (security 403
  on classes). e2e testTimeout 60s globally (suite setups logging in many roles exceeded 5s on this machine).
- Lead: migrations `20261024090000_notices_lesson_attachments` (Notice, NoticeRead, LessonPlan attachment*) and
  `20261024100000_attendance_note` (AttendanceRecord.note for OD reason), SQLite + Postgres. Seed bell schedule:
  period 7 = Lunch Break 13:00–14:00 (was a gap), afternoon periods 8/9, PERIODS teaching = [1,2,4,5,6,8].
- Fees "card Download PDF not working": API verified — all 488 invoice + 335 receipt PDFs return valid PDFs
  (accounts + parent) → bug is browser-side (agent investigating) or the stale :3001 backend the reviewer hit.
- sweetalert2 11.26.25 installed in frontend (logout confirmation).
- 3 builder agents (brief: scratchpad BRIEF3.md): gate desk/roles/logout/profile/students table; attendance/OD/
  timetable/roll-call/attendance-math audit; student notices/lesson-plan PDF/staff tables/reports alignment/fees.
- **Gate desk / roles (agent, 14/14 own suite):** new `/gate` page (Issue pass — `POST /gate-passes {issue:true}`
  by warden/admin = created + warden-approved in one action, principal approval still follows; Approvals; Verify &
  exit/return; Pass records `GET /gate-passes/records` filters + CSV, never passCode/OTP; Visitors). /leaves lost the
  security-desk tab (link card to /gate). Hostel reads (rooms/allocations/unallocated/roll-call) = HOSTEL_ADMIN +
  leadership; GET /hostel + visitors stay on desk roles. `confirmLogout()` SweetAlert exported from DashboardShell
  (user menu, mobile drawer, Settings sign-out). Notices unread badge on "Notices & messages" (parents + students).
  Students page own card design + table cleanup; warden read-only. /account profile + /account/password reworked;
  users stay signed in after a password change; `/auth/me` returns password_changed_at.
- Lead: tests updated for decisions (hostel rooms/roll-call reads as warden, warden attendance read → 403);
  Settings role descriptions updated. TODO (lead): server-side enforcement of mustChangePassword in auth.guard
  (frontend-only today) — do after agents finish; parent/test flows must change password first.
- **Notices / academics / tables (agent, 15/15 own suite):** `backend/src/notices/` (POST /api/notices — R.BROADCAST
  any target; teacher/HOD only own classes/students; also_send sms|email via notify ref_type 'notice'; GET /notices,
  /notices/targets, /mine, /:id/read, /unread-count, expire/delete). /notifications has "Student notices" tab;
  teachers get "Notify class" in the Academics header; /portal/messages = Notices | SMS & email (fires
  `notices:changed`). Lesson plan PDF: POST/DELETE/GET /academics/lesson-plans/:id/attachment (multipart, PDF magic
  bytes, 10 MB) + /plan.pdf export. Staff & payroll tables, /reports alignment reworked. Fees card ROOT CAUSE:
  card view had NO receipt download (only a non-clickable "N receipts" chip; phones default to cards) → footer now
  has invoice + receipt buttons; /portal/fees rebuilt with invoice + receipt PDFs.
  GOTCHA: `table.data-table thead th { text-align:left }` is unlayered → `text-right` on <th> loses; use `th-end`.
- Lead: nav badge refreshes on `notices:changed`; apiDownload keeps the blob URL 60 s (1 s could cancel downloads on
  iOS Safari / Firefox — second plausible cause of "PDF download not working").
- **Attendance / timetable (agent, 11/11 own suite; full run 406/406):** ONE attendance rule in
  `backend/src/attendance/attendance-math.ts` — attended = Present+Late+OD; counted = Present+Late+OD+Absent; Leave
  excluded; Sundays/'Holiday' never counted — applied to all 13 endpoints (reports, profile, TC, calendar, report
  card, portal). Before: one student could show 4 different % (reports/profile counted Present only; nobody excluded
  Leave or Sundays) — most likely the "Jayantha attendance looked wrong" report. OD needs a reason (stored in
  AttendanceRecord.note), never sends absence SMS. New /attendance/sheet, /analytics, filtered /absentees, /low.
  Warden removed from attendance reads. Timetable: bell order by start time everywhere, lunch/short break rows,
  class + teacher week PDFs, Day View. New components/attendance/* (status colours, StudentCalendar,
  ClassSectionSelect, MarkAttendance, MonthlyRegister, AbsenteesView, AttendanceInsights). RollCallPanel rebuilt.
  /reports/attendance semantics changed: `present` = attended, `total_records` = counted days (+late/od/leave fields).
- Lead: roll-call roster returns marked_at + marked_by_name (shown in "Last marked"); test titles updated.
- **Razorpay (test mode) — IN PROGRESS when paused:** keys written ONLY to git-ignored `backend/.env`
  (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) and `frontend/.env.local` (NEXT_PUBLIC_RAZORPAY_KEY_ID). Backend accepts
  RAZORPAY_SECRET as alias (`razorpayKeySecret()` in payments.service.ts). `test/e2e-env.ts` blanks RAZORPAY_* so
  tests always use the mock gateway. New `frontend/src/lib/razorpay.ts` (`payWithRazorpay(order, details)` → Checkout
  → POST /api/payments/razorpay/verify; settles paid|dismissed|failed; failures during retry don't settle early).
  Wired into /portal/fees (was "pay at office" when razorpay configured) and /admission-form.
  OPEN: tsc error portal/fees/page.tsx `child.fullName` → must be `child.full_name` (fix was rejected mid-edit);
  real order creation + browser checkout NOT yet tested. Handoff doc: `capsule.md` (repo root).

## 12. Round 4 — mobile responsiveness ONLY (2026-10-24), branch `jayanth/mobile-responsive`
- Upstream: round 3 committed by Jayanth as 4df6e74, merged to main as PR #3 (merge identical). Branched from main.
- Rule from Jayanth: mobile only — desktop (≥1024px) and functionality must not change. Every change is either a
  `max-lg:`/`max-md:` Tailwind variant, a mobile-only element (`lg:hidden`/`md:hidden`), `contents` wrapper (no box on
  desktop), or CSS inside `@media (max-width: …)` (MOBILE LAYER block at the end of globals.css).
- Shell: 56px app bar + safe-area top on <1024px, search = icon trigger (`<CommandPalette compact />`) instead of an
  extra row, hamburger hidden on mobile (bottom nav "More" opens the drawer), back arrow on detail pages, footer
  hidden on mobile, main gets bottom padding for the nav. New `components/mobile/MobileBottomNav.tsx` (M3 navigation
  bar: 4 role-priority destinations from navFor + More; badges; safe-area bottom; lg:hidden).
- Kit (`ui.tsx`): Modal = bottom sheet on phones (grabber, 92dvh, sticky full-width actions, safe area); Tabs =
  swipeable single row (`m-scroll-x`); PageHeader 22px title on phones, icon hidden (app bar shows it); toasts above
  bottom nav. globals.css mobile layer: 44px buttons/fields, 16px inputs (no iOS zoom), no hover-lift on touch,
  `.m-above-nav` for sticky save bars (MarkAttendance, RollCallPanel), `.m-scroll-x`. viewport-fit=cover.
- Students form + IncidentDrawer made phone sheets; Timetable page (own header/tiles) got phone variants.
- Verification plan: desktop pixel-diff (1440px) of every page vs a baseline built from main, plus mobile audit
  (overflow, <40px targets, <12px text) — scripts in .playwright-mcp/ (capture-before/after.js, mobile-audit.js).
- Design pass 1 audit (68 pages, 6 roles + login, 390x844): 0 pages scroll sideways; 55 overflowing elements
  (warden /gate card wider than screen, /notifications filter bar); many <40px targets; screenshots in
  .playwright-mcp/mobile/design/. Fixes (all mobile-only):
  - IssuePassPanel + SecurityDesk grids: `max-lg:grid-cols-1` (implicit grid track grew to the house badge width).
    House badge truncates on phones (`max-md:max-w-[45%]` + inner `max-md:truncate`).
  - CardHead actions wrap full-width on phones (ui.tsx); notifications filters flex to fill the row.
  - Drawer close button + bell → 40px on <1024px. TableView Table/Cards toggle → 40px, header padding 16px.
  - Button size="sm" had `!min-h-8` (beats the mobile CSS) → added `max-md:!min-h-10 max-md:!px-3`.
    IconButton `max-md:!px-3.5` (44x44). Students "Open" link, academics delete icon, login demo chips enlarged.
  - Attendance P/A/L/OD + hostel roll call status → full-width segmented control, 44px segments, on phones.
  - Fees: tabs = one swipeable row (were stacked 4 rows), KPIs 2x2 with label/amount stacked, 16px gutters.
  - Login password eye: 44x44 hit area on phones.
  - globals.css (max-md): `.field.pl-9/.pl-10` padding — PRE-EXISTING DESKTOP BUG: unlayered `.field{padding}`
    beats Tailwind `pl-9`, so search icons overlap placeholder text on desktop too (gate, notifications, classes).
    Fixed on mobile only per the "don't touch desktop" rule; flagged to Jayanth.
  - Audit script now ignores off-screen elements (closed drawer) — part of the target-count drop is that, not fixes.
- Design pass 2 audit: 0 sideways scroll, 0 overflowing elements, small targets 1772 → 253 (rest = inline text
  links in cards, 13px CBT checkbox, settings ghost buttons 45x32), text <12px = intentional 11–11.5px captions.
  Known UX gap (not changed — would alter behaviour): /fees renders all 488 invoice cards (no pagination), same
  as the desktop table; page is ~190k px tall on a phone.
- tsc clean, next build clean. ESLint has no config in this repo (`next lint` can't run) — not a pass, just absent.
- Desktop baseline = detached worktree of HEAD 95343ac in scratchpad/baseline (node_modules junctioned), served on
  :5175; current on :5174; both on backend :3001 with frozen prisma/mobile-baseline.db. Diff script:
  .playwright-mcp/desktop-diff.js (1440 + 1024 widths, byte-identical PNG compare, one retry).
- Desktop diff RESULT: 136 comparisons (6 roles, every nav page + login, at 1440 and 1024): 123 byte-identical on
  first pass; 13 flagged → re-run with 4.5s settle → 10 identical. Remaining 3: student profile identical on 3rd run;
  security /gate = 5 px, max delta 2/255 (anti-aliasing); admin home @1024 = "Quick access" card at y=1146 vs 1160 —
  HEAD/main flips between the same two positions run-to-run (pre-existing load-order nondeterminism), not ours.
  At 1024 the mobile media query is false and MobileBottomNav is display:none in the current build (checked in DOM).
  Verdict: desktop unchanged. Baseline worktree removed afterwards (junction deleted first; real node_modules intact).
- Jayanth tested on his real phone (360px CSS width, 720px @2x) and found clipped cards/tables, bell popover off
  screen, toolbar scrolling with tables, roll/name overlap. My earlier audit MISSED these because (a) it ignored
  anything inside scroll/clip containers and (b) with isMobile emulation the layout viewport silently WIDENS to fit
  too-wide content, so innerWidth grew and nothing looked "past the edge". New audit `.playwright-mcp/mobile-audit-v3.js`
  measures against the device width (360), flags clip-inside-cards, overlaps, unexpected scrollers, every tab + both
  Table/Cards modes.
- Root cause of clipped cards: `.as-cards tbody{grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))}` — 21rem =
  336px > ~290px available on a 360px phone. Mobile CSS: one column, 12px gaps, 16px card padding, title left-aligned,
  badge max 6rem with ellipsis, dense matrices 4-across, no hover-lift.
- Table mode on phones: pages wrap TableView in an overflow-x scroller → toolbar scrolled with the table. Mobile CSS
  makes the wrapper visible and the table area (`.table-view > div:last-child`) the scroller.
- Bell hover-preview hidden < lg (touch fired fake hover + navigation → popover stuck over next page).
- Toasts move under the app bar on pages with a sticky save bar (`body:has(.m-above-nav) .m-toasts`).
- Shell: main bottom padding `max-lg:!pb-…` (Tailwind v4 emits max-* before sm:, so sm:py-6 was winning 640–1023px
  and the bottom nav covered page ends on tablets); Back falls back to section href when no history; landscape
  safe-area left/right (body padding, drawer, bottom nav). Bottom nav badge: sr-only text, "/staff" short label "Staff".
- MarkAttendance TableView title="Student" (card headline = name, not roll no; affects card mode on desktop too —
  opt-in view). MonthlyRegister roll box `max-md:w-auto` — PRE-EXISTING DESKTOP BUG: `w-6` box overlaps "10A01"
  with the name on desktop too; flagged to Jayanth, not changed on desktop.
- Reference skill: github.com/ceorkm/mobile-app-ui-design (SKILL.md: 375 baseline, 8pt grid, 44pt targets,
  value-over-label, thumb zone) cloned to scratchpad as reference data.
- Parallel pass: 7 agents with disjoint file ownership (students/admissions/classes; attendance/timetable/WeekGrid;
  fees/exams/cbt/reports/academics/charts; gate/leaves/hostel/discipline; staff/notifications/settings/account;
  portal/**; home dashboards + login). Shared files stay with me. Brief: scratchpad/agent-brief.md.
- Independent code review (agent) findings — pre-existing FUNCTIONAL bugs, reported not fixed (no functional changes
  allowed this round): MarkAttendance load() race (switch date fast → D1 data saved as D2); RollCallPanel same race +
  stale roster after failed load saves Morning as Night; razorpay.ts loadRazorpay retry after a failed script load
  never settles (Pay spinner forever); staff /fees "Collect" fills a form far below the list on phones (no scroll);
  Modal/CommandPalette no focus trap; drawer no Esc/focus trap. Command palette ranks description matches above
  title matches ("fee" → My children). Palette has no "My account"/"Change password" entries.
- Round-4b (Jayanth: "card look is very bad", "add toaster, sweetalert, confirmation popups on update/delete", "click every
  component, screenshot, verify"):
  - Card CSS (mobile): fields hug content (pills no longer stretched), values left-aligned, labels 11px; RecordCard footer
    equal-width only for 1–2 actions (`max-md:[&:not(:has(>:nth-child(3)))>*]:flex-1`).
  - NEW `components/confirm.ts`: `confirmAction({title,text,confirmText,tone})` + `confirmWithReason(...)` — branded
    SweetAlert (same look as logout). 8 agents wired it into every update/delete/approve/reject/publish/check-in/out/pay
    across all modules: 68 call sites; all window.confirm/prompt removed (0 native dialogs left). First-time creates
    (add student, first "Save attendance", issue pass, new test) intentionally NOT confirmed. Toasts made specific.
  - students "Mark left" native prompt() → confirmWithReason (one SweetAlert with reason field).
  - Click-through test `.playwright-mcp/clickthrough2.js` (360px touch, every role, every nav page, every main-content
    button; confirms cancelled, dialogs closed): 156 taps, 110 screenshots, 0 flags (no write without confirm, no native
    dialog, no page errors, no stuck dialogs). Run 1 (clickthrough.js) had a script blind spot (custom overlays without
    role=dialog) — fixed in v2.
  - 360px audit after round 2: 158 states, 0 clipped cards, 0 sideways page scroll; remaining "overlaps" verified by eye as
    detector false positives (padding boxes); 2 intentional scrollers (swipe chart, week grid).
  - Desktop diff (round-1 agent build): 124/136 byte-identical; all others ≤32/255 deltas (anti-aliasing/timing) except the
    known pre-existing admin-home@1024 flip on main; login identical on recapture.
  - Agent-reported PRE-EXISTING bugs (not fixed, no functional changes allowed): toast colour picked by regex on message text
    (timetable, fees, notifications — "N failed" success shows red; errors without the words show green; students page FIXED
    by agent to always toast errors red); RoomsPanel run() swallows errors so follow-ups run on failure + double toast on
    auto-assign; IncidentDrawer archive closes drawer even on failure; PayrollPanel double toast; timetable "Today" uses UTC
    date (wrong 00:00–05:30 IST); desktop CBT top bar sticky top-0 hides under the 64px header; `.field.w-auto` can't shrink
    (unlayered width:100%) on desktop; settings note flex <p> splits text/link on desktop; notifications search icon overlap
    on desktop; login world-clock times are hard-coded.
- Round-4c (Jayanth's full mobile design-system brief, mobile only): drawer profile summary (lg:hidden) → /account;
  NEW `components/mobile/MobileFilters.tsx` (phones: "Filters (n)" button + bottom sheet with Clear all / Show results;
  desktop: `contents` wrapper = identical inline); TableView `mobileHide` hint → `data-mhide` → hidden on phone cards only.
  8 agents applying filters/card hierarchy/form grouping per module (brief: scratchpad/agent-brief-3.md).
  Dedicated View/Edit ROUTES not created: edit flows are full-height bottom sheets on phones; new routes would be a
  functional/navigation change (brief §8.6 allows sheets/dialogs by complexity). Student profile is the existing detail page.
- Round-4d (Jayanth, testing on his phone; "just design, I will test, you don't test"):
  - RecordCard phones: header becomes a grid (avatar spans 2 rows; name wraps to 2 lines; status badge on its own row
    under the name — the badge no longer squeezes the name); footer `.record-card-footer` = even 2-column grid of
    same-height buttons (ghost buttons outlined; lone/odd last action spans the row). Lead wrapped in a div (desktop
    layout unchanged: flex item with content width).
  - Generic TableView cards (phones): list-row card — title + status on one line, label-left/value-right rows with hairline
    dividers, long text + controls full width under their label, equal-width action footer. Dense matrices untouched.
  - "Every add/edit/view must be a separate page on mobile, no big popups": did NOT create new routes (would rewire
    navigation/data on every module = functional change). Instead, on phones (<768px) every add/edit/view surface is a
    FULL-SCREEN PAGE: shared `Modal` (23 uses) → 100dvh, app bar with back arrow (X hidden on phones via `contents
    max-md:hidden` wrapper), scrolling body, pinned Save/Cancel, slide-in `m-page` animation; students Add/Edit form and
    discipline IncidentDrawer converted the same way. NEW `components/mobile/useMobileBack.ts`: pushes a same-URL history
    entry (copies Next's history.state so the app router doesn't reload) so the phone Back button closes the screen;
    closing from UI pops it. SweetAlert confirms stay as small dialogs (right pattern). MobileFilters stays a bottom sheet.
  - Not yet verified by me (Jayanth asked me not to test): this build's desktop pixel-diff, 360px audit, click-through.
    Must be run before commit.
- Round-4e (Jayanth: "filters/forms text very big on mobile"; "PDF download UI very plain — enhance in both"):
  - Mobile `.field` 16px/44px → 14px/42px; 16px kept ONLY on iOS Safari via `@supports (-webkit-touch-callout: none)`
    (prevents zoom-on-focus). Removed agent-added `max-md:text-base` on inputs/selects (students, timetable, fees, login).
  - Download experience (desktop + mobile): `lib/api.ts apiDownload` now emits `erp:download` events
    (start/progress/done/error; streams the body for real byte progress; same request, same saved file/name) and
    NEW `components/DownloadTray.tsx` (mounted in root layout) shows a card per download: coloured file tile
    (PDF/XLS/CSV) with shine while preparing, name, live "x KB of y KB"/percent, progress bar (indeterminate when no
    length), green "Saved to your downloads" or red error; auto-dismiss. Desktop bottom-left, phones under the app bar.
  - PDF documents (every printable — receipts, invoices, report cards, payslips, gate passes, admission letters, lesson
    plans, ID cards, exports): `backend/src/common/pdf.ts buildPdf` redesigned, same PdfSpec/PdfBlock API so no caller
    changed: navy header band + school logo tile (NEW `common/pdf-logo.ts`, base64 of frontend/public/logo.png so it ships
    in dist, monogram fallback), reference chip, accent stripe, accent-bar title, section headings with rule, fields as a
    rounded two-column card (splits across pages), tables with navy header (repeated on continuation pages), zebra rows,
    right-aligned numeric columns, ellipsis instead of hard cut, signature chip, footer rule + "Page X of Y".
    Sanity-generated a sample receipt (16.9 KB) — not a UI test. Backend rebuilt + restarted on the frozen DB copy.
- Round-4f (Jayanth phone screenshots): (1) roll-call filter sheet "breaking" — the sheet was position:fixed inside a
  card with backdrop-filter (creates a containing block → sheet trapped/clipped in the card). MobileFilters sheet now
  portals to <body>; because that moves the controls out of the page <form>, the sheet is a proxy <form> forwarding any
  submit (Apply button / Enter / "Show results") to the trigger's enclosing form via requestSubmit (page onSubmit runs as
  before). (2) Visitor log: phone-only visitor card (name+phone, Inside/Left badge, aligned dl Meeting/Hostel/Pass/In/
  Out/Purpose, full-width Check out); desktop markup kept inside a `contents max-md:hidden` wrapper. (3) Gate pass
  rows: phone header name/class + status (+Late) badge, meta incl. pass code, actions as an even 2-col grid of 44px
  buttons (Reject left, approve/issue right, Print full row); desktop badges/code wrapped `contents max-md:hidden`.
  (4) RecordCard header back to badge top-right (name wraps 2 lines instead of truncating); footer CSS generalized:
  captions (e.g. invoice no.) full row, button wrappers full-row 2-col grid.
- Paused at ~95% of Jayanth's usage limit. capsule.md (repo root) rewritten as the round-4 handoff: rules, running
  servers, mobile-only gotchas, everything built, and the IN-PROGRESS task — 4 mockup card designs (students, gate pass
  records, hostel roll call, staff payslips) via a planned TableView `mobileCards` prop (not yet written). All round-4
  work uncommitted on jayanth/mobile-responsive.
- Round-4g (Jayanth's 5 mockups: payslip, staff directory, hostel roll call, gate pass records, student card):
  - `TableView` `mobileCards` prop finished + used by students, gate pass records, staff payslips, staff directory,
    hostel roll call. Phones render the purpose-built cards (`md:hidden`), desktop keeps the same card/table views;
    the generic `.as-cards` restyle stays behind `max-md:hidden` when a custom phone card exists.
  - NEW `components/mobile/MobileCard.tsx`: `MCard` (20px radius white surface + soft corner wash), `MAvatar`
    (gradient/soft initials disc, optional status dot), `MChip` (icon chip), `MLabel`, `MPanel` (inset block),
    `MCopyRow` (call/mail + copy-to-clipboard), `MStat` (labelled cell for 2×2 grids). One language across all
    phone cards, 44–48px actions.
  - Students: done in the previous session (avatar + status, class/roll/house chips, contact panel, Profile/Edit/
    Mark left/Delete grid). Gate pass records + payslips: also from the previous session. This round added
    **staff directory** (avatar + Active, email/phone copy panel, role/subject/login chips, Profile + Edit +
    Create login) and **hostel roll call**: per-boarder card — room band + bed chip, Student label + avatar + ID·class,
    Status label + 3 full-width 48px segments (Present green / Absent outline / On Leave amber, same radiogroup
    handlers), Last-marked tinted box (green when unmarked), plus a **phone save bar** (hostel tile + name + “date ·
    session”, Present/Absent/On-leave count tiles, unsaved dot, full-width navy Save). Desktop bar unchanged
    (wrapped in `max-md:hidden`).
  - App bar (mobile only, from the mockups): 66px header with a 40px icon tile, 19px `<h1>` page name and a
    one-line tagline (`routeTagline()` in RouteMeta; short map + dynamic routes). `PageHeader`'s title/subtitle
    block is now `max-md:hidden` — phones already show it in the app bar, actions still render; desktop unchanged.
  - tsc 0 errors, `next build` clean, `next start` restarted on :5174 (phone URL http://192.168.31.75:5174,
    backend already on :3001). No browser tests run — Jayanth asked to design only and test himself.
- Round-4h (Jayanth: "remove the padding of card in hostel, payroll, students, gate … no padding in mobile view",
  plus the Academics/Attendance mockups):
  - Card padding on phones: `TableView`'s custom-card container lost its `p-3` + `bg-page`; the record lists'
    enclosing cards are `max-md:contents` (students, gate Pass records, payroll payslips, hostel roster, attendance
    mark sheet) so their box (border/white fill/padding) disappears on phones and the cards sit on the page with the
    single 16px column gutter — exactly like the mockups. Desktop keeps the same card boxes. Hostel's filter/counter
    rows got `max-md:px-4` back because their container's padding was dropped; students' record header lost its
    mobile border/padding.
  - Academics → Lesson Plans (phones): card design from the mockup — status-tinted 48px icon tile, 17px topic, unit ·
    subject · class, date + teacher meta, Attach PDF / Export as equal 44–48px buttons (same `LessonPlanPdfActions`,
    same upload/export handlers), hairline, then the status select tinted by state (Planned amber / In Progress blue /
    Completed green) + red delete tile. Desktop list unchanged (`max-md:hidden`).
  - Attendance legend: `AttendanceLegend` now renders an “Attendance Legend & Calculation” card on phones (P/A/L/OD/Lv
    rows with the status squares, the % formula panel and the “leave and Sundays not counted” note); the compact
    inline legend is `md:`-only. Used by Mark attendance, Low attendance and Analytics, so all three get it.
  - Mark daily attendance (phones): per-student card via `mobileCards` — avatar, name (opens the calendar), roll,
    approved-leave line, “Status” label + 5-segment control (Present filled green with a check; P/A/L/OD/Leave),
    OD/Leave reason input, and the saved status/notice line. Same `setStatus` / keyboard handlers; desktop table
    unchanged.
  - Analytics/overview already used the mockup language (tinted KPI tiles + sparkline, Status-mix donut, by-class
    bars, legend) — not restyled.
  - tsc 0, `next build` clean, `next start` restarted on :5174. Committed + pushed to `jayanth/mobile-responsive`
    (Jayanth asked for it this time).
- 2026-10-25 (Jayanth: "record whole workflow on https://genesis-erp-web.jayanth-m.workers.dev with playwright"):
  - Found commit 5341016 "feat(mobile): phone-first redesign…" (by another session, pushed) containing all round-4 work
    incl. the 4 mockup cards (students / gate pass records / roll call / payslips via TableView `mobileCards`). Also
    staged-not-committed deploy files from that session: frontend/wrangler.jsonc, open-next.config.ts, render.yaml,
    docs/DEPLOY.md, backend/scripts/sqlite-to-postgres-import.js (+ untracked .wrangler*, .open-next, .deploy-backup,
    backend/.pgtest). Not touched.
  - LIVE SITE ARCHITECTURE (temporary): Cloudflare Worker `genesis-erp-web` (OpenNext) → `/api` rewritten to a
    cloudflared QUICK TUNNEL (`.bin/cloudflared.exe tunnel --url http://127.0.0.1:3001`, log `.bin/tunnel.log`) → local
    backend `node dist/src/main` on dev.db. Quick-tunnel hostnames change on every start and BACKEND_URL is baked into
    the worker at build time → any tunnel restart needs a worker rebuild + deploy. The site was down (530) because the
    local backend + tunnel had been killed by the low-memory reaper.
  - Restored: backend + new tunnel (https://stanley-mills-jumping-leather.trycloudflare.com), `npm i --no-save
    @opennextjs/cloudflare@1 wrangler@4` (package.json untouched; this pruned the no-save playwright from
    frontend/node_modules), `BACKEND_URL=<tunnel> npx opennextjs-cloudflare build`, `npx wrangler deploy` → version
    fcfcf27d-3a45-436d-8046-dda7b1f98810. All 6 demo roles log in via the worker URL.
  - Durable fix still pending (DEPLOY.md plan): backend on Render + Neon Postgres, or a NAMED cloudflared tunnel with
    a fixed hostname, so the live site doesn't depend on this laptop staying awake.
  - Recording: scratchpad/rec/record.js (Playwright in a scratch folder), desktop 1440x900, one .webm per role into
    C:\Users\princ\Downloads\genesis-erp-recordings, 3 at a time; all non-GET /api calls except login are aborted
    (walkthrough cannot write data); dialogs opened then cancelled.
- 2026-10-25 mobile font-size pass (Jayanth: "in mobile view across all places check the font size and fix it, then push
  and deploy"): measured 19,934 rendered text nodes at 360px (every role, page, tab) on the live site with
  scratchpad/rec/fontaudit.js. Target scale (phones): page title 22, card/section title 16–17, body 14, secondary 13,
  labels 12 (11 uppercase), buttons/inputs 14, badges 12, KPI 22–24, app bar 17, nav 11.5, floor 11.
  Fixes (all max-md:/max-lg: — desktop unchanged): app-bar title 19→17 (DashboardShell); page titles 24→22 (account,
  dashboard hero, portal greeting); CardHead titles 18→16 (ui.tsx) + exams h2s; attendance legend 20/15→16/13.5
  (status.tsx); academics list titles 17→15; MarkAttendance card names 17→15; student/staff card names 18→17;
  calendar day letters 9→11 (StudentCalendar); portal child-chip class 11→12; gate student class 11.5→12.5; meter
  captions 11.5→12.5 (RecordCard Meter); Button sm 12.5→13.5 and .btn-* 14px on phones.
  Worker rebuilt + deployed (version 57ea3031-d687-41d6-9774-16b1e784c9d7) against the same quick tunnel.
- 2026-10-25 LIVE-SITE 530 FIX (Jayanth: "y 530 fix it globally"): backend + tunnel had died again when the Claude
  session ended. Made the live site self-sufficient:
  - NEW frontend/cf-worker.mjs = worker entry (wrangler.jsonc main): proxies /api/* to the URL in Workers KV
    (binding CONFIG, namespace 95131be16e4943d08c2bcee75557ee8c, key BACKEND_URL, read per request, cacheTtl 30s);
    everything else → OpenNext handler; re-exports its Durable Object classes. Tunnel/backend down → clean JSON
    502/503 instead of Cloudflare 530 HTML. Deployed version 15fce6e3-d947-4097-bc82-11f289f2ad84. The baked Next
    rewrite (old tunnel) is now irrelevant — the worker intercepts /api first.
  - NEW .bin/keepalive.ps1 (laptop, independent of Claude): every 30 s ensures backend (node dist/src/main, backend/.env
    → dev.db) and cloudflared quick tunnel (`--metrics 127.0.0.1:45678`) are up, restarts dead ones, reads the tunnel
    hostname from http://127.0.0.1:45678/quicktunnel and `npx wrangler@4 kv key put BACKEND_URL … --remote` when it
    changes. Single-instance mutex. Logs .bin/keepalive.log (+ backend.*.log, tunnel.log).
    Autostart: %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GenesisERP-KeepAlive.vbs (hidden).
  - Verified: all 6 roles log in on the live URL; /api/auth/me 200; killed backend+tunnel at 09:27:56 → keep-alive
    restarted both, new tunnel published to KV, live login 200 at 09:29:20 (no rebuild/redeploy).
  - Still laptop-dependent (must be on/awake). Durable fix = DEPLOY.md: backend on Render + Neon, then set KV
    BACKEND_URL to the Render URL (one command, no redeploy) and remove the Startup .vbs.
  - cf-worker.mjs + wrangler.jsonc changes NOT committed (not asked); wrangler.jsonc was staged by the other session.
- 2026-10-25 NEW /landing (Jayanth: "most beautiful, enhanced, animated landing page, full of sections, route /landing,
  no link for now"): frontend/src/app/landing/{layout.tsx (metadata, robots noindex), page.tsx}. Client page, motion/react
  + page-scoped CSS. Sections: glass sticky nav (anchors + Sign in → /login), scroll-progress bar, navy aurora hero with
  blur-in headline, animated gradient text, CTAs and a 3D-tilted live dashboard mockup (bars grow, SVG path draws,
  floating notification cards); module marquee; count-up stats (product facts only: 16 roles, 20+ modules, 6 portals,
  100% mobile-ready); 4-col bento of 9 features with animated mini-visuals (attendance segments, OTP flip, fee meter,
  payslip, roll call); interactive role switcher (6 roles, shared-layout pill, blur transitions); scroll-drawn
  5-step workflow timeline; phone showcase (auto-cycling screens, tappable bottom nav); trust cards; FAQ accordion;
  final CTA band; footer. No fabricated testimonials/customers. MotionConfig reducedMotion="user" + CSS reduced-motion
  fallbacks. public/school-banner.jpg NOT used (third-party clip art with a watermark).
  Verified locally (next build OK, 17 kB route): desktop 1440 + phone 390 screenshots, 0 page errors, 0 sideways
  scroll. Nothing links to /landing. Not deployed / not committed (not asked).
- 2026-10-25 /landing round 2 (Jayanth: "footer not good, UI okay, enhance more, add geometrical shapes"): NEW
  frontend/src/app/landing/shapes.tsx — line-art SVG geometry (ring, dashed ring, triangle, filled triangle, rounded
  square, diamond, hexagon, plus, dot grid, half-circle, zig-zag, isometric cube) via GeoField (drift + spin CSS vars,
  optional pointer-depth parallax with springs), Orbits (3 rotating orbit rings with glowing dots behind the hero
  mockup), presets HERO/LIGHT/DARK/CTA, and a new Footer (dark navy, glow + grid + shapes, brand block with chips,
  4 link columns → page anchors / /login, CTA strip with Sign in + back-to-top, giant gradient "GENESIS" wordmark,
  bottom bar). Geometry placed in every section; feature cards got a hexagon corner that rotates on hover; trust
  section got id="trust". Reduced motion stops all shape animation. Verified: build OK (20.4 kB route), desktop/phone
  screenshots, 0 page errors, 0 sideways scroll. Served locally on :5180. Not deployed/committed.
- 2026-10-25 /landing round 3 (Jayanth: "completely redesign Everything connected / Safe by design / FAQ"): NEW
  frontend/src/app/landing/sections.tsx — ConnectedSection (hub-and-spoke SystemMap: Genesis core + 8 colour-coded
  module nodes on an ellipse with dashed pulse lines, hover/focus a node selects the module; module explorer with
  auto-advance (6 s progress bar, pauses on interaction, only while in view), 8 animated illustrative previews:
  attendance marking, gate-pass approval stepper + parent OTP, invoice paid stamp + receipt, timetable filling +
  substitute, report-card bars, hostel bed grid + roll-call counts, payslip deductions, safeguarding timeline; phones
  get a chip scroller), TrustSection (dark security console: 4 pillars with spring check badges, glowing shield with
  conic radar sweep + rings, live audit-trail console streaming sample entries), FaqSection (sticky editorial heading
  + "Still curious?" card, numbered 01–05 accordion with gradient border on the open item, plus→minus morph).
  page.tsx: old bento/trust/FAQ + their data/mini-visuals removed; CSS lp-pulse / lp-ping / lp-radar (+ reduced
  motion). Fixed phone overflow (grid items without grid-cols-1 grew to the chip scroller's width) on these grids and
  the hero/mobile grids. Verified: build OK (25.7 kB), desktop + phone section screenshots, 0 page errors, 0 sideways
  scroll, per-element edge check OK at 360 and 390 px. Stale :5180 process (pre-reap) was serving the old build —
  killed and restarted. Not deployed/committed.
- 2026-10-25 commit + PR (Jayanth: "beautiful commit message, push to my branch, raise a PR"): upstream check found
  Prashanth's PR #6 merged to main (leaves approvals widget nav fix + .github/workflows/sync-upstream.yml + FLOW_AND_ROLES
  guide; touches ui.tsx, leaves panels, RoleWidgets) and 2 deploy commits on this branch from another session (backend
  now on Render: genesislumia-erp-demo.onrender.com, KV BACKEND_URL). `git merge-tree` HEAD vs origin/main = clean.
  Committed ONLY frontend/src/app/landing/* + this log; left the other session's uncommitted docs/DEPLOY.md,
  frontend/.env.example, frontend/package.json (cf:* scripts) untouched for it.

### 2026-10-25 — Landing round 4: "How it flows" (#flow) redesigned
- Jayanth: the old alternating vertical timeline "is very bad / not satisfied".
- New `frontend/src/app/landing/flow.tsx` → `FlowSection({ head })`: a metro line with 5 stations (Admission, Fees, Daily school life, Assessment, Insight). The line fills with each stage's colour and a glowing marker travels along it. The section auto-plays every 6.5s while in view, pauses on hover, and stations are clickable; prev/next buttons and a timer bar sit below.
- The stage card shows: what happens (4 checks), who's involved, what it creates, and a "Hands off to <next>" button. The last stage loops back ("And the cycle continues").
- Phones: same layout. Stations use short labels (Admit/Fees/Daily/Assess/Insight) and the card stacks.
- `page.tsx`: removed `FLOW` data, `flowRef`/`flowP`/`flowLine`, and the old section block; it now renders `<FlowSection head={<SectionHead ... sub=.../>} />`.
- An earlier draft of flow.tsx was cut off mid-write; that partial file was deleted before this version.
- Verified: tsc clean, next build OK (/landing 28.2 kB), desktop and phone screenshots of #flow (stage 1 and stage 5), clipcheck 360/390 all ok, no sideways scroll, 0 page errors. Server restarted on :5180. Not committed.

### 2026-10-25 — Landing: stats strip redesigned
- Jayanth (screenshot of the 4 pale stat boxes): "this ui is very bad".
- New `frontend/src/app/landing/stats.tsx` → `StatsBand`: one dark navy rounded panel (grid texture, blue and emerald glows) with 4 stats split by straight 1px rules. Each number has a matching visual that animates when it scrolls into view: 16 role dots light up, 20 module tiles flip in colour, 6 portal screens power on (3 desktop, 3 phone), and a ring fills to 100%. Numbers count up in white→sky gradient text.
- Layout: 1 column on phones, 2 at sm, 4 at lg. The first version used borders on rounded cells, which drew curved dividers; replaced with absolute 1px spans.
- `page.tsx`: the old stats grid became `<StatsBand />`. Removed the now-unused `CountUp` and the `animate`/`useInView` imports.
- Verified: tsc clean, build OK (/landing 29 kB), desktop and 360px screenshots, clipcheck 360/390 ok, 0 page errors. Not committed.

### 2026-10-25 — Landing: stats → bento, then slimmed
- The dark stats band was "not good". Jayanth picked "Bento with visuals" (AskUserQuestion).
- v1 bento (`stats.tsx`): a big 20+ modules card with all 20 module tiles, a 16 roles cloud, 6 portal windows, and a full-width 100% card with 3 mini phones.
- Jayanth: "100% is good but modules, roles, portals has too much content". He interrupted my edit that added a sync strip; it had already written to the file, and the slimming below removed it.
- Now: 3 equal cards in a row (md:grid-cols-3), each with number + title + one short line + one compact visual. Modules = 7 overlapping icon tiles + "+13". Roles = 4 chips + violet "+12 more". Portals = 6 small icon tiles. The 100% card is unchanged (md:col-span-3): attendance, fee-paid and report-card phones; the attendance phone is hidden below sm.
- Verified: tsc clean, build OK (/landing 30.2 kB), desktop and 360px screenshots (natural scroll), clipcheck 360/390 ok, 0 page errors. Not committed.

### 2026-10-25 — Landing: separate app-like phone design (MobileLanding)
- Jayanth: "desktop is superb, but not satisfied with mobile. I need Flutter-type animated, a separate mobile-compatible design."
- New `frontend/src/app/landing/mobile.tsx` → `MobileLanding({ modules, roles })`. `page.tsx` renders it in `lg:hidden`; the whole existing desktop tree is wrapped in `hidden lg:block`, otherwise unchanged.
- Phone design:
  - App bar that turns solid on scroll.
  - Dark rounded hero with spring word-in and a live notification stack (5 generic school events cycling).
  - Swipeable stat carousel with a dot indicator.
  - 4-column app-launcher module grid with spring pop-in.
  - Roles as a swipeable PageView (drag or tap a chip; layoutId pill).
  - Expandable "How it flows" stepper with a growing rail.
  - Trust card (2x2), FAQ expansion tiles, a CTA, and the shared Footer.
  - A floating bottom nav (Home/Modules/Roles/Flow/FAQ) with a Material-style moving pill. It tracks the section in view via `[data-tab]`; CTA and footer count as FAQ.
  - A `Tap` helper gives every tappable thing an ink ripple and a spring press.
- To share data: exported `FAQ`, `PILLARS` (sections.tsx) and `STAGES` (flow.tsx). MODULES/ROLES are passed as props, because page.tsx can't have extra exports.
- Fixes found while verifying: the role card clipped its 4th point (300px → 372px, and 408px under 400px wide); the nav stuck on "Flow" at the FAQ (data-tab).
- Verified: tsc and build OK (/landing 34.4 kB). Pixel 7 frames end to end. Role swipe changes the role. Every role card fits at 360/375/390/412. The FAQ tab is active at the bottom. No sideways scroll, 0 page errors. At 1440 the mobile tree is hidden and the desktop hero is visible.
- NOTE: clipcheck.js checks the desktop section ids, which are hidden on phones now, so it no longer covers the mobile tree; use mob.js/mob2.js/mob3.js. Not committed.

### 2026-10-25 — Mobile landing v2: "App showcase" (replaced the app-like v1)
- Jayanth: "no need of mobile footer… not only footer, everything is bad". Picked **App showcase** (AskUserQuestion). Worst parts of v1: "animations feel cheap" and "colours / dark blocks".
- `mobile.tsx` rewritten. Light palette only, no dark sections. No ripple, bouncy pops, bottom tab bar or footer.
  - Pastel intro: "Run your school from your pocket." + Get started.
  - A pinned phone (sticky 100svh, section 440svh). Its screen pushes iOS-style (spring, no bounce) through 5 screens as you scroll: Attendance (rows auto-marking P/A), Fees (UPI → Paid), Gate pass (Warden → Principal → code 4829), Timetable (current period highlighted), Report card (bars grow).
  - Caption and a progress pill under the phone; the background tint follows each screen.
  - Then a light role-chips row, a plain FAQ accordion, and an end CTA.
- Phone screen designed at 290x600 and scaled to `min(600px, 62svh)` via ResizeObserver.
- `MobileLanding` now takes only `roles`. Reverted the `PILLARS`/`STAGES` exports (FAQ is still exported).
- Verified: tsc and build OK (/landing 33.5 kB). Pixel 7 and iPhone SE: scrolling shows all 5 screens in order, no sideways scroll, 0 page errors. Screenshots reviewed. Not committed.

### 2026-10-25 — Mobile landing v3: dark + light, more info, swipeable phone
- Jayanth (phone screenshot of v2): "add dark too, not only light; why less info; I can swipe the section in mobile; enhanced UI, best UI for mobile".
- `mobile.tsx` v3, still `lg:hidden`; desktop untouched. Sections alternate dark (#071630 + aurora/grid) and light:
  1. Dark hero: headline with blur-in words, full description, Get started / See the app, 2x2 glass stats (20+ / 16 / 6 / 100%).
  2. Light showcase (#m-show): tab chips (Attendance/Fees/Gate pass/Timetable/Report card) with a sliding layoutId pill, and a **swipeable phone** (drag x; 50px or a flick), side arrows and tappable dots. It auto-advances every 4.2s while in view and pauses 9s after any touch. The 5 screens are kept from v2, with the iOS push transition; the background tint and glow follow the screen.
  3. Light modules: 2-column cards with icon, name and one-line description; 6 shown, "Show all 12 modules" toggles the rest.
  4. Dark roles: snap carousel of all role cards (head + 4 points) with dots.
  5. Light flow: the 5 STAGES as a timeline whose rail fills on scroll.
  6. Dark trust: 4 PILLARS with descriptions, shield + ping.
  7. Light FAQ accordion.
  8. Dark closing card + © line. Still no footer.
- Re-exported `PILLARS` (sections.tsx) and `STAGES` (flow.tsx) for this.
- Verified: tsc and build OK (/landing 35.7 kB). Pixel 7 and iPhone SE: swipe left → Fees, swipe right → back to Attendance, the Report card tab works. No sideways scroll, 0 page errors. Full-page frames reviewed. Not committed.

### 2026-10-25 — Mobile landing: section-by-section redesigns (mobile.tsx only)
- **Everything connected** (Jayanth: "not satisfied"): a hub. A "Student record" core with two slowly counter-rotating rings of 8 + 4 module icons (icons stay upright) and dashed lines; the active line pulses. A detail card shows the module's description and a "Shares data with" chip list (tap to jump). It auto-cycles every 2.8s and pauses 8s after a tap. Jayanth: "gud".
- **Built for every role**: a stories-style avatar row (conic ring on the active role) plus a Tinder-style swipe deck (3 stacked cards, drag to throw, prev/next buttons).
- **Safe by design**: a radar shield with 4 orbiting pillar icons. A live "Security check" ticks each pillar (spinner → check) with a progress bar, then shows "All checks passed".
- **FAQ**: a support chat. The first Q&A is pre-answered; question chips post a user bubble, show typing dots for 1.2s, then the answer.
- Verified for those three (Pixel 7 + iPhone SE): the deck swipe went Principal → Teacher with no card overflow, the security check completed, the chat showed typing then answered, no sideways scroll, 0 errors. Jayanth: "gud".
- **How it flows**: v1 was an Instagram-stories card with full stage gradients. Jayanth: "very bad, don't add too much colour". v2 (current) is calm: off-white section, ink + a single accent blue. A vertical line fills as you scroll and a blue dot travels it; the step at the centre of the screen becomes a white card showing what it creates and the hand-off; the others stay muted grey. Verified the active step advances while scrolling, no sideways scroll, 0 errors.
- Lesson: Jayanth prefers restrained colour on mobile. Don't use full-bleed multi-colour gradients.
- Build OK (/landing 39.1 kB). Not committed.

### 2026-10-25 — Mobile landing: smoothness pass
- Jayanth: "add some smoothness for the animations in mobile view".
- `mobile.tsx`:
  - Hero words no longer animate a blur filter (transform + opacity only, 0.9–1s).
  - Showcase background and glows, and the hub glow, crossfade opacity layers (AnimatePresence) instead of repainting backgroundColor on blurred elements; the old showcase gradient jumped.
  - The trust shield crossfades blue → green instead of jumping between gradients.
  - Removed backdrop-blur from in-content cards (stat tiles, security card, showcase arrows); the header keeps it.
  - The flow line and dot are spring-smoothed (useSpring 90/24).
  - FadeUp is 0.9s / 22px; section heads stagger kicker → title → sub.
  - Softer phone push spring (220/32).
  - will-change hints on the deck cards, phone screens and rotating rings.
- `page.tsx` CSS: below 1024px `.lp-aurora` uses blur 60px (was 90) and 32s drift. Desktop is unaffected since its tree is hidden there.
- Verified: tsc and build OK (/landing 39.2 kB). Pixel 7 with CPU throttled 4x, scrolling the whole page: median frame 16.7 ms (60 fps), p95 49.9 ms, 11 of 378 frames over 50 ms. Headless Chromium renders in software, so these numbers are rough. No before-measurement was taken. Showcase tab still works, no sideways scroll, 0 errors. Not committed.

### 2026-10-25 — Committed + pushed landing round 4
- Before committing: `git fetch` showed the branch level with origin and nothing new on main beyond PR #6 (already reported; it doesn't touch the landing page). PR #7 is open and mergeable.
- Commit "feat(landing): a calmer desktop story and a phone-first landing" contains only frontend/src/app/landing/* (flow.tsx, stats.tsx, mobile.tsx, page.tsx, sections.tsx) and this file. No watermark or co-author lines.
- Left unstaged (another session's work): docs/DEPLOY.md, frontend/.env.example, frontend/package.json.
- Pushed to jayanth/mobile-responsive, so it updates PR #7.
