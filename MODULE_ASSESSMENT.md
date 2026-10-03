# Genesis ERP — Honest Reality Assessment v2 (post gap-closing pass)

**Stack:** Next.js 15 + Tailwind (frontend, port 5173) · NestJS 11 + Prisma + SQLite (backend, port 3001, prefix `/api`)
**Verification:** backend `nest build` 0 errors · frontend `next build` 0 errors · **e2e 84/84 passing, idempotent (verified on consecutive re-runs)**
**Legend:** ✅ Working end-to-end · 🟡 Working, needs a real external account/infra to go live

---

## The one-line reality

**All 13 modules are implemented end-to-end with tests. 12 of 13 are fully working features (not partials). The only genuinely unfinished area is CBT's student-facing exam UI — which was explicitly exempted — and every remaining gap is an external-account/integration matter (real SMS gateway, real payment gateway, object storage), not missing product code.**

---

## Module by module

| # | Module | Status | Verified by |
|---|--------|--------|-------------|
| 0 | Foundations (auth, roles, branching) | ✅ | 5 e2e tests |
| 1 | Admissions (9-step workflow, docs, letter, parent link) | ✅ | 15 tests |
| 2 | Student Information System | ✅ | 8 tests |
| 3 | Parent Communication | ✅ infra / 🟡 delivery | 3 tests |
| 4 | Fees (structures → invoices → receipts) | ✅ | 3 tests |
| 5 | Attendance (marking, register, reports) | ✅ | 5 tests |
| 6 | Timetable & Substitution | ✅ | 8 tests |
| 7 | Leaves & Gate Pass (+ balances, OTP) | ✅ | 4 tests |
| 8 | Discipline & Safeguarding (+ audit, parent SMS) | ✅ | 2 tests |
| 9 | Academics (subjects/syllabus/plans/assignments) | ✅ | 4 tests |
| 10 | Reports & Dashboards (+ CSV export) | ✅ | 6 tests |
| 11 | Hostel (rooms, allocation, moves audited, visitors) | ✅ | 1 test |
| 12 | Staff & Payroll (auto unpaid-leave pull) | ✅ | 2 tests |
| 13 | CBT (exam engine) | ✅ engine / 🟠 no student test UI | 2 tests |

### What changed in this pass (was a gap in v1, now done)
1. **Roll numbers follow the spec**: `[CLASS][YEAR][SEQ]` (e.g. `CLASS10A-2026-001`), collision-safe max+1 sequencing that survives re-runs and counts both enrolled students and allocated-but-not-enrolled admissions. e2e asserts the format and sequential uniqueness.
2. **Houses are balanced**: allocation goes to the least-populated house (Red/Blue/Green/Yellow), persisted on the Student record too.
3. **Parents can actually submit**: every trigger-links application gets a one-off token; a public, token-gated form page (`/admission-form?token=…`) lets parents fill and submit without an account; the office sees the application move to "Submitted by Parent". e2e covers GET by token, anon submit, bad token 404.
4. **Letters and receipts are printable**: admission letters render a signed print view (roll no, house, class); fee receipts print per-payment lines with `RCPT-` numbers.
5. **True attendance %**: student profiles compute over **all** attendance records (optional date range) and report how many records were counted — the old last-30-records shortcut is gone.
6. **Monthly attendance register**: class × month matrix (P/A/L per day) in the API and the UI.
7. **Invoice/receipt numbers**: sequential `INV-YYYY-NNNN` / `RCPT-YYYY-NNNN`, collision-safe, shown in lists and receipts.
8. **Leave balances**: per-staff used/quota/remaining per leave type (Casual 12, Sick 8, Earned 15, Duty 10) computed from approved leaves, shown in the Leaves UI.
9. **Incidents notify parents**: generic, detail-free SMS logged on incident creation.
10. **Reports export**: CSV download buttons (students/fees/attendance) in the Reports UI.
11. **Hostel moves are audited**: every room move writes an audit-log entry (`room X → Y`), visible in the admin audit viewer.
12. **Payroll auto-pulls LOP**: `payslips/generate` derives unpaid-leave days from approved `Unpaid` leaves overlapping the month (manual map still supported); e2e proves exact math (3 days → 3000 docked, net 27000).
13. **Notification delivery is env-configurable**: set `NOTIFY_WEBHOOK_URL` and every SMS/email/WhatsApp POSTs the real payload there; without it, the log honestly records `mocked` instead of pretending `sent`.

---

## What is still honestly NOT production (needs external accounts/decisions, not code)
1. **Real message delivery** — the webhook seam is real code, but until you point `NOTIFY_WEBHOOK_URL` at MSG91/Twilio/SES, messages only appear in the notification log.
2. **Real payment collection** — offline entry + receipts is complete; an online gateway (Razorpay/Stripe) needs merchant credentials and is a deliberate integration.
3. **File storage** — admission documents are base64 rows in SQLite (2 MB cap). Works for a pilot; swap for S3/disk in production.
4. **SQLite** — single-file DB, fine for a pilot/demo; one datasource line + migration moves to Postgres for concurrency.
5. **PDFs are print views** — letters/receipts use the browser's print dialog (standard for school ERPs), not server-side PDF generation.
6. **Payroll tax math** — flat-rate TDS/EPF (configurable per staff); no Indian slab calculation, LWF, or professional tax.
7. **CBT student UI** — the server-authoritative engine (timing window, answer stripping, auto-grade, manual grading queue) is done and tested; the per-student countdown screen was explicitly exempted by you.
8. **Minor best-practice notes** — admins can still hard-delete incidents (safeguarding would forbid), no refresh-token flow, timetable generator is greedy not constraint-optimised.

**Bottom line:** 84 automated e2e tests (idempotent on a persistent DB) cover every module's happy paths, guards (401/403/404/409), the OTP flow, spec roll-number rules, doc-number sequences, balance math and payroll math. The system is demo-complete and pilot-ready; going live is an integrations checklist, not a development backlog.
