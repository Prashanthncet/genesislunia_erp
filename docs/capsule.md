# Capsule — Genesis ERP mobile-UI handoff (2026-10-24, round 4)

Hand this file to the next AI. It is self-contained. Full history: `PROJECT_MEMORY.md` §12 (round 4 log, every
change listed), §11 (round 3). Earlier capsule content (stack, roles, logins) is summarised in §1–§4 below.

## 1. Project
School ERP (Sainik School demo). **Next.js 15 + Tailwind v4** (`frontend/`, CSS-first tokens in
`frontend/src/app/globals.css @theme`) + **NestJS 11 + Prisma 6** (`backend/`, `/api`). SQLite by default.
Windows, Git Bash + PowerShell. Owner: **Jayanth**.

## 2. Owner's rules (non-negotiable)
1. **No watermark/attribution anywhere** — no "Generated with…", no "Co-Authored-By" in commits/PRs/files/docs.
2. `git fetch` before building; report others' upstream changes up front.
3. **Log every change in `PROJECT_MEMORY.md`** (§12), even tiny ones.
4. Verify by running things; report failures honestly; never say "done" unverified.
5. **Don't commit/push unless asked.** Be candid and human.
6. Round 4 specific: **MOBILE ONLY — desktop (≥768px for page UI, ≥1024px for the shell) must look exactly as
   before; don't change functionality** (handlers, API calls, validation, data). Exceptions the owner explicitly
   asked for (apply on all sizes): SweetAlert confirmations before every update/delete, toasts, the download tray
   and the new PDF design.
7. Latest instruction: **"just design the UI, I will test, you don't do any testing."** Build + restart the server
   for him; don't run Playwright audits unless he asks. He tests on his Android phone (360px CSS width).

## 3. Repo / branch state
- Branch **`jayanth/mobile-responsive`** (from main @ 95343ac = PR #3 merge). `origin/main` unchanged as of last fetch.
- **Everything below is UNCOMMITTED** (~80 frontend files + 2 backend files). Nothing pushed.
- Untracked junk to delete before commit: `backend/prisma/mobile-baseline.db-shm`, `-wal` (test DB copy files).
  `backend/prisma/mobile-baseline.db` = frozen copy of dev.db used by the test backend (git-ignored *.db).
- Secrets: Razorpay TEST keys live only in git-ignored `backend/.env` / `frontend/.env.local`. Never print/commit.

## 4. Running servers (for Jayanth's phone testing)
- Frontend: `cd frontend && npx next build && npx next start --port 5174` → phone URL **http://192.168.31.75:5174**
  (laptop Wi-Fi IP; Windows firewall already allows node on Public profile).
- Backend (test, frozen DB, Razorpay blanked so Pay uses the mock gateway):
  ```
  cd backend && DATABASE_URL="file:./mobile-baseline.db" PORT=3001 NODE_ENV=development LOGIN_RATE_LIMIT=1000 \
  GLOBAL_RATE_LIMIT=1000000 RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_SECRET= node dist/src/main
  ```
  (rebuild backend with `npx nest build` after backend edits). To restart: kill the process listening on the port
  (PowerShell `Get-NetTCPConnection -LocalPort 5174 -State Listen` → `Stop-Process`), then start again.
- A baseline server of untouched HEAD may still be running on :5175 (worktree in the session scratchpad) — only used
  for the desktop pixel-diff; safe to kill.
- Demo logins: `schooladmin@sainik01.edu / Demo@Admin1`, `teacher@… / Demo@Teacher1`, `warden@… / Demo@Warden1`,
  `security@… / Demo@Security1`, `parent@… / Demo@Parent1`, `student@… / Demo@Student1` (login page has tap-to-fill chips).

## 5. How mobile-only changes are made (the rules that keep desktop identical)
- Only ADD Tailwind `max-md:` (<768px) / `max-lg:` (<1024px) classes, `md:hidden` / `lg:hidden` mobile-only elements,
  `contents` wrappers (no box on desktop), or CSS inside `@media (max-width: 767.98px)` / `(1023.98px)` in globals.css.
- **Gotcha 1:** Tailwind v4 emits `max-*` rules BEFORE `sm:`/`md:` → when an element also has `sm:x`, use `max-md:!x`.
- **Gotcha 2:** unlayered component classes in globals.css (`.btn-*`, `.field`, `.card`, `.badge` (display:inline-flex),
  `.label`, `.card-head`) beat Tailwind utilities. `btn-soft md:hidden` does NOT hide → use `md:!hidden`; or wrap in
  `<span className="contents max-md:hidden">`.
- **Gotcha 3:** a `position:fixed` overlay inside an ancestor with `transform`/`filter`/`backdrop-filter` gets trapped
  in that ancestor → render overlays through `Portal` (components/ui.tsx).
- **Gotcha 4:** with mobile emulation the layout viewport silently widens to fit too-wide content; audit against the
  device width (360), not `innerWidth`.

## 6. What exists now (round 4, all uncommitted)
Shell & shared (owned by "lead"; agents must not edit):
- `components/DashboardShell.tsx`: 56px mobile app bar (back arrow on detail pages, icon search), bottom nav, drawer
  (now with profile summary → /account, logout separated), safe areas, main bottom padding `max-lg:!pb-…`.
- `components/mobile/MobileBottomNav.tsx` (4 role-priority destinations + More).
- `components/mobile/MobileFilters.tsx`: phones = "Filters (n)" button → bottom sheet (portalled; proxy `<form>`
  forwards submit/Apply to the page's form via `requestSubmit`); desktop = `contents` wrapper, identical inline.
- `components/mobile/useMobileBack.ts`: phone Back button closes full-screen add/edit/view screens (pushState copy of
  Next's history.state).
- `components/ui.tsx` `Modal`: on phones = FULL-SCREEN PAGE (100dvh, app bar with back arrow, scrolling body, pinned
  footer, slide-in `.m-page`); desktop unchanged (X kept via `contents max-md:hidden`). Students Add/Edit form and
  discipline `IncidentDrawer` converted the same way. (Owner asked: "every add/edit/view = separate page on mobile,
  no big popups" — implemented as full-screen pages, not new routes, to avoid functional change.)
- `components/confirm.ts`: `confirmAction({title,text,confirmText,tone})`, `confirmWithReason(...)` — branded SweetAlert.
  68 call sites across all modules; all `window.confirm/prompt` removed. First-time creates intentionally not confirmed.
- `components/TableView.tsx`: phones default to Cards; `mobileHide` hint hides columns on PHONE cards only.
- `components/RecordCard.tsx`: phone header (badge top-right, name wraps 2 lines), footer `.record-card-footer`
  (CSS grid: captions full row, button groups 2-col, odd last spans).
- `app/globals.css` MOBILE LAYER (end of file): generic table→card design on phones (title+status, label-left/
  value-right rows with hairlines, full-width controls, action footer), table mode scrolls inside its box, compact
  fields **14px/42px** (iOS-only 16px via `@supports (-webkit-touch-callout:none)`), toasts, `.m-page` animation,
  download-tray styles.
- `lib/api.ts apiDownload` emits `erp:download` events (start/progress/done/error, streamed bytes) +
  NEW `components/DownloadTray.tsx` (mounted in `app/layout.tsx`): polished download card on all sizes.
- Backend: `backend/src/common/pdf.ts buildPdf` redesigned (navy band + logo `common/pdf-logo.ts` base64, accent
  title/headings, field cards, navy table headers repeated per page, zebra, right-aligned numbers, page X of Y).
  Same PdfSpec API; every PDF uses it. Backend rebuilt (dist) and restarted.
Per-module mobile work (7–8 agents × 3 rounds): filters → MobileFilters, card hierarchy (mobileHide), 44px targets,
2-up KPIs, stacked headers, sticky save bars (attendance, roll call, marks), visitor-log phone card, gate-pass phone
rows, CBT take screen, login, dashboards reordered with `max-md:order-*`, profile page sections, etc. Details per
file in PROJECT_MEMORY.md §12.

## 7. DONE (round 4g) — mockup cards
Owner sent 5 mockups (student card, gate "Pass records" card, hostel roll-call card, staff payslip card, staff
directory card) and said "do these kind of design for particular cards". All are built:
- `TableView` `mobileCards` prop + `components/mobile/MobileCard.tsx` kit (MCard/MAvatar/MChip/MLabel/MPanel/
  MCopyRow/MStat). Users: students, gate PassRecordsPanel, staff PayrollPanel, staff DirectoryPanel, hostel
  RollCallPanel. Desktop card/table views are untouched.
- Phone app bar (from the same mockups): 66px, 40px icon tile, 19px `<h1>` + tagline (`routeTagline()` in
  RouteMeta → TAGLINES map); `PageHeader` text block is `max-md:hidden` on phones (actions stay).
Original plan (kept for reference):
1. **TableView `mobileCards` prop (lead, not yet written):** in card mode, `<div className="md:hidden">{mobileCards}</div>`
   and keep the generic/`cards` rendering for desktop (`max-md:hidden`), so desktop card mode is unchanged. Was reading
   `components/TableView.tsx` lines ~101–200 to add it.
2. Build 4 phone-only card designs (pass via `mobileCards`, or `md:hidden` blocks), data from existing state only:
   - **Students** (`app/(dashboard)/students/page.tsx`): 64px gradient avatar circle with status dot; name 18px bold;
     "S2026-1003 · Male"; Active pill; chip row: Class (blue, layers icon) · Roll (# icon, grey) · House (tinted, home
     icon); contact panel (rounded, bordered): phone row + email row, each with icon tile, value, copy button; actions:
     Profile (primary filled blue), Edit (outline), Mark left (outline), Delete (danger tint) — at 328px use a 2×2 grid
     (4-across doesn't fit). Subtle tinted swoosh in the top-right corner. (Kebab "⋮" in mockup: optional/skip.)
   - **Gate pass records** (`components/gate/PassRecordsPanel.tsx`, TableView): rounded-square initials tile, name,
     "ID · Class", status pill top-right; chips: type (person icon), "House · Room" (home icon, tinted); reason line;
     times panel 2×2: OUT (PLANNED) with calendar icon, EXPECTED IN, ACTUAL OUT, ACTUAL IN with clock icons, "—" when empty,
     uppercase small labels, dividers.
   - **Hostel roll call** (`components/hostel/RollCallPanel.tsx`): per-boarder card: header band "S-101" + bed chip "B1"
     (bed icon); "Student" label; avatar + name + "ID · Class"; divider; "Status" label; 3 segmented buttons Present
     (green filled + check icon when selected), Absent (outline, minus icon), On Leave (amber tint, clock icon) — same
     radio handlers; "Last marked / Not marked" info box (green tint, clock icon). Sticky bottom bar (`m-above-nav`):
     hostel icon + name + "date • session", count tiles Present/Absent/On leave (green/red/amber tints), "Not saved yet"
     dot, full-width Save roll call.
   - **Staff payslips** (`components/staff/PayrollPanel.tsx`): avatar circle, name, "Role · Dept", status pill; NET PAY big
     blue number + GROSS right in a tinted panel; deductions panel 3 cols TDS / PT / EPF; "Payslip period" row with
     calendar icon tile; actions Mark paid (primary navy) + PDF (outline) — same handlers, keep confirms.
   Check each file's available fields first; never invent data ("—" when missing).
3. Rebuild + restart frontend for Jayanth (see §4). Log in PROJECT_MEMORY.md §12. — DONE round 4g: tsc clean,
   build clean, :5174 restarted (backend already on :3001). Still not browser-tested at his request.

## 8. Before any commit (owner hasn't asked yet)
- `cd frontend && npx tsc --noEmit -p .` and `npx next build` (last state: both clean).
- Desktop must be unchanged: pixel-diff script `.playwright-mcp/desktop-diff.js` (needs HEAD baseline on :5175 —
  `git worktree add --detach <dir> HEAD`, junction node_modules, build, `next start --port 5175`). Last run on an
  earlier round: all diffs anti-aliasing/timing except the known pre-existing admin-home@1024 flip on main. NOT re-run
  since rounds 3–4f (MobileFilters `md:!hidden` fix, full-screen modals, cards, tray, field sizes).
- Mobile audit `.playwright-mcp/mobile-audit-v3.js` (360px, tabs + table/cards), click-through
  `.playwright-mcp/clickthrough2.js` (last: 156 taps, 0 writes without confirm).
- Delete `backend/prisma/mobile-baseline.db-shm/-wal`. Commit message: no attribution lines.

## 9. Known pre-existing bugs (reported, NOT fixed — ask owner before touching)
MarkAttendance/RollCall load race (fast date switch saves wrong date's data); razorpay.ts script-load retry hangs;
toast colour chosen by regex on message text (timetable/fees/notifications); RoomsPanel `run()` swallows errors
(follow-ups run on failure, double toast); IncidentDrawer archive closes on failure; PayrollPanel double toast;
timetable "Today" uses UTC date; desktop CBT top bar hides under header; `.field.w-auto` can't shrink on desktop;
notifications search icon overlaps placeholder on desktop; MonthlyRegister `w-6` roll box overlaps name on desktop;
command palette ranks description matches above titles; login world-clock times hard-coded; login eye icon same
in both states; notifications card view lacks "History" action; admissions queue last column titled "Open" (cards
show it as a field); several lists show empty state while loading; some raw ISO dates (exams, profile, timetable).
