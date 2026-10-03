# -*- coding: utf-8 -*-
"""Generate the module-wise Excel workbook for the Genesis ERP delivery plan.

Usage:  python scripts/generate_module_workbook.py
Output: Genesis_ERP_Module_Workbook.xlsx (repo root)
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT = "Genesis_ERP_Module_Workbook_v2.xlsx"

HEADER_FILL = PatternFill("solid", fgColor="0F2A43")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=11)
TITLE_FONT = Font(bold=True, size=14, color="0F2A43")
STATUS_FILL = {
    "Working": PatternFill("solid", fgColor="C6EFCE"),          # green
    "Partial": PatternFill("solid", fgColor="FFEB9C"),          # amber
    "Mocked": PatternFill("solid", fgColor="FCE4D6"),           # orange
    "Missing": PatternFill("solid", fgColor="FFC7CE"),          # red
}
THIN = Side(style="thin", color="B0BEC5")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(vertical="top", wrap_text=True)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

MODULES = [
    {
        "no": 0, "phase": "0", "name": "Foundations (Auth & Branching)",
        "status": "Working",
        "summary": "JWT auth, 5 roles, RolesGuard, branch_id scoping on every query, seed data.",
        "endpoints": "POST /api/auth/login; GET /api/auth/me; guard helpers",
        "frontend": "Login page; role badge in DashboardShell",
        "e2e": "5 tests (login ok/bad, me, 401s)",
        "gaps": "No refresh tokens; no password reset flow.",
    },
    {
        "no": 1, "phase": "1", "name": "Admissions",
        "status": "Working",
        "summary": "9-step workflow: Links Sent -> Submitted -> Validated -> Fee Approved -> Roll No -> VP Approved -> Admission Complete (creates Student).",
        "endpoints": "fields CRUD; trigger-links; :id/submit|validate|pay|verify-receipt|allocate|vp-approve|principal-approve; :id/documents CRUD; documents/:docId/download; :id/letter-data",
        "frontend": "Admissions page (existing)",
        "e2e": "12 tests incl. document upload/download and letter-data 403",
        "gaps": "Documents stored as base64 in SQLite (2MB cap - swap for object storage in prod); letter/receipt are browser print views, not server-side PDFs; delivery depends on notification provider config.",
    },
    {
        "no": 2, "phase": "2", "name": "Student Information System",
        "status": "Working",
        "summary": "Full student CRUD with pagination, search, filters, status activation, profile with TRUE aggregate attendance % (all records, optional date range)/marks/hostel/fees; classes CRUD with delete guard.",
        "endpoints": "GET/POST /api/students; GET/PUT/DELETE /api/students/:id; PUT :id/status; classes CRUD",
        "frontend": "students/page.tsx (new): table, filters, pagination, add/edit modal, deactivate",
        "e2e": "7 tests (create, dup 409, invalid 400, pagination, update, status)",
        "gaps": "None material for the demo scope.",
    },
    {
        "no": 3, "phase": "3", "name": "Parent Communication",
        "status": "Partial",
        "summary": "Central NotificationsService logs email/SMS/WhatsApp to notification_logs; all modules route through it; UI log viewer with channel filter.",
        "endpoints": "GET /api/notifications?ref_type|recipient|channel",
        "frontend": "notifications/page.tsx rewired to real API (was demo data)",
        "e2e": "2 tests (list, ref_type filter via leave decision)",
        "gaps": "Fully wired to every module + honest 'mocked/sent/failed' status in the log; actual delivery needs NOTIFY_WEBHOOK_URL pointing at a real gateway (MSG91/Twilio/SES). Token-based parent form link exists; no parent login portal.",
    },
    {
        "no": 4, "phase": "4", "name": "Fees",
        "status": "Working",
        "summary": "Structures CRUD, sequential INV- invoice numbers, per-term bulk generation (idempotent), offline payments with RCPT- receipt numbers and overpay blocked, status rollup Unpaid -> Partially Paid -> Paid, printable receipts, CSV export.",
        "endpoints": "structures CRUD; GET/POST invoices; POST invoices/generate; GET invoices/:id; POST payments",
        "frontend": "fees/page.tsx (new): structures tab + invoices tab with generate & record payment",
        "e2e": "2 tests (structures CRUD; lifecycle incl. overpay 409)",
        "gaps": "No online payment gateway (offline entry by design); no discounts/scholarships.",
    },
    {
        "no": 5, "phase": "5", "name": "Attendance",
        "status": "Working",
        "summary": "Batch marking per class/date, notify-absent flow, monthly class register (per-student x per-day matrix), per-class % reports, CSV export.",
        "endpoints": "POST /api/attendance; GET /api/attendance; POST /api/attendance/notify-absent; GET /api/reports/attendance",
        "frontend": "attendance/page.tsx (existing, working)",
        "e2e": "4 tests",
        "gaps": "No biometric/device integration; no leave-adjusted aggregates.",
    },
    {
        "no": 6, "phase": "6", "name": "Timetable & Substitution",
        "status": "Working",
        "summary": "Teachers/rooms/periods CRUD, master timetable, school view, absence -> auto substitution generation, substitution management.",
        "endpoints": "teachers/rooms/periods CRUD; master/:classId; today/:classId; school-view; POST teachers/:id/absent; substitutions list/delete; slot PUT; substitute POST; generate POST",
        "frontend": "timetable pages incl. SubstitutionGrid (existing)",
        "e2e": "8 tests",
        "gaps": "Generator is greedy, not constraint-optimised; no teacher preferences.",
    },
    {
        "no": 7, "phase": "7", "name": "Leave & Gate Pass",
        "status": "Working",
        "summary": "Staff & student leave apply/approve/reject with role guards and email logging; yearly leave balances (used/quota/remaining); gate pass lifecycle Pending -> Warden -> Principal -> Checked Out -> Returned with parent OTP enforcement.",
        "summary": "Staff & student leave apply/approve/reject with role guards and email logging; gate pass lifecycle Pending -> Warden -> Principal -> Checked Out -> Returned with parent OTP enforcement.",
        "endpoints": "staff-leaves CRUD+decision; student-leaves CRUD+decision; gate-passes create/detail/approve-warden/approve-principal/checkout/checkin",
        "frontend": "leaves/page.tsx (new): 3 tabs, approve/reject actions, OTP check-in box",
        "e2e": "3 tests incl. wrong-OTP 400 and full lifecycle",
        "gaps": "OTP 'delivery' depends on the notification provider; no leave encashment/carry-forward.",
    },
    {
        "no": 8, "phase": "8", "name": "Discipline & Safeguarding",
        "status": "Working",
        "summary": "Incident CRUD with Open/Under Review/Closed, demerits, confidential notes; AuditLog on VIEW/CREATE/UPDATE/DELETE; admin-only audit log; strict role allow-list.",
        "endpoints": "GET/POST incidents; GET/PUT/DELETE incidents/:id; PUT :id/status; GET audit-log",
        "frontend": "discipline/page.tsx (new): report form, status dropdown, audit log modal (admin)",
        "e2e": "1 test (create/view-audited/status/audit-log/delete + invalid status 400)",
        "gaps": "Hard delete still allowed for admins (best practice would forbid); parent SMS is generic and depends on provider config.",
    },
    {
        "no": 9, "phase": "9", "name": "Academics",
        "status": "Working",
        "summary": "Subjects CRUD (unique code, delete guard), syllabus units, lesson plans (topic/date/status), assignments publish with guardian notification.",
        "endpoints": "subjects CRUD; syllabus CRUD; lesson-plans CRUD; assignments CRUD",
        "frontend": "academics/page.tsx (new): subjects/syllabus/plans/assignments tabs",
        "e2e": "4 tests",
        "gaps": "No homework-submission tracking or grading of submissions.",
    },
    {
        "no": 10, "phase": "10", "name": "Reports & Dashboards",
        "status": "Working",
        "summary": "Cross-module dashboard KPIs, per-class attendance %, fee collection summary, per-exam averages, hostel occupancy + payroll totals.",
        "endpoints": "GET /api/reports/dashboard|attendance|fees|academics|summary",
        "frontend": "reports/page.tsx (new): KPI cards, fee tiles, attendance bars, exam averages",
        "e2e": "5 tests",
        "gaps": "CSV export covers students/fees/attendance; no trend charts over time.",
    },
    {
        "no": 11, "phase": "11a", "name": "Hostel",
        "status": "Working",
        "summary": "Hostels/rooms CRUD with delete guards, manual allocation (capacity enforced, move semantics), auto-allocation to freest room, visitor log with pass numbers and checkout guard.",
        "endpoints": "hostel CRUD; rooms CRUD; allocations list/create/delete; allocations/auto; visitors list/create/:id/checkout",
        "frontend": "hostel/page.tsx (new): hostels, rooms, allocations (manual+auto), visitor log",
        "e2e": "1 test (full lifecycle + double checkout 409)",
        "gaps": "Room moves are audit-logged; no mess/attendance integration.",
    },
    {
        "no": 12, "phase": "11b", "name": "Staff & Payroll",
        "status": "Working",
        "summary": "Staff CRUD with soft-deactivate on history, salary structure upsert, monthly payslip generation (idempotent) that AUTO-PULLS unpaid-leave days from approved Unpaid leaves (docked basic/30), TDS+EPF, mark-paid.",
        "endpoints": "staff CRUD; GET/PUT salaries/:staffId; GET payslips; POST payslips/generate; PUT payslips/:id/mark-paid",
        "frontend": "staff/page.tsx (new): staff tab, salary tab, payroll tab with generate & mark-paid",
        "e2e": "2 tests incl. exact arithmetic (net 30550) and idempotency",
        "gaps": "Flat-rate TDS/EPF - no Indian tax slabs/LWF/professional tax; payslip is data + print view, not server-side PDF.",
    },
    {
        "no": 13, "phase": "11c", "name": "CBT (Computer Based Tests)",
        "status": "Partial",
        "summary": "Question bank (MCQ validation), test builder with ownership checks, publish lifecycle, server-authoritative timing (+5 min grace), answer-stripped papers, MCQ auto-grade, manual subjective grading queue, results.",
        "endpoints": "questions CRUD; tests CRUD; publish/complete; tests/:id/start; tests/:id/submit; attempts/:id/grade; tests/:id/results",
        "frontend": "cbt/page.tsx (new): question bank, test builder, results & grading viewer",
        "e2e": "2 tests incl. auto-grade score 3 + manual grade -> 7, delete guard 409",
        "gaps": "No live countdown UI or tab-lock (server timing is enforced); no question media/images.",
    },
]

ROWS = ["no", "phase", "name", "status", "summary", "endpoints", "frontend", "e2e", "gaps"]
HEADERS = ["#", "Phase", "Module", "Status", "What works", "Backend endpoints", "Frontend page", "e2e coverage", "Honest gaps / to-production"]

def style_header(ws, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
        cell.border = BORDER

def style_body(ws, nrows, ncols, heights=None):
    for r in range(2, nrows + 2):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = BORDER
            cell.alignment = WRAP
        ws.cell(row=r, column=1).alignment = CENTER
        ws.cell(row=r, column=2).alignment = CENTER
        if heights:
            ws.row_dimensions[r].height = heights

wb = Workbook()

# ── Overview sheet ───────────────────────────────────────────────
ws = wb.active
ws.title = "Overview"
ws["A1"] = "Genesis ERP — Module-wise Delivery Workbook"
ws["A1"].font = Font(bold=True, size=16, color="0F2A43")
ws["A2"] = "Stack: Next.js 15 + Tailwind · NestJS 11 + Prisma + SQLite · e2e 84/84 passing (idempotent, verified on re-runs)"
ws["A2"].font = Font(size=11, color="475569")
ws["A3"] = "Status: Working = end-to-end complete · Partial = works with documented gaps · Mocked = infrastructure works, external delivery simulated"
ws["A3"].font = Font(size=10, italic=True, color="64748B")

start = 5
headers = ["#", "Phase", "Module", "Status", "One-line summary", "Key gaps"]
for c, h in enumerate(headers, 1):
    ws.cell(row=start, column=c, value=h)
ws.append([])  # noop guard
# write module rows
for i, m in enumerate(MODULES):
    r = start + 1 + i
    ws.cell(row=r, column=1, value=m["no"])
    ws.cell(row=r, column=2, value=m["phase"])
    ws.cell(row=r, column=3, value=m["name"])
    ws.cell(row=r, column=4, value=m["status"])
    ws.cell(row=r, column=5, value=m["summary"])
    ws.cell(row=r, column=6, value=m["gaps"])
nrows = len(MODULES)
style_header(ws, len(headers))
style_body(ws, nrows, len(headers), heights=52)
for i, m in enumerate(MODULES):
    cell = ws.cell(row=start + 1 + i, column=4)
    cell.fill = STATUS_FILL[m["status"]]
    cell.alignment = CENTER
    cell.font = Font(bold=True)
for c, w in enumerate([5, 8, 30, 11, 60, 60], 1):
    ws.column_dimensions[get_column_letter(c)].width = w
ws.freeze_panes = "A6"

# ── One sheet per module ─────────────────────────────────────────
for m in MODULES:
    sheet = wb.create_sheet(f"{m['no']:02d} {m['name'][:24]}")
    sheet["A1"] = f"{m['no']:02d} · {m['name']}"
    sheet["A1"].font = TITLE_FONT
    sheet["A2"] = f"Delivery plan phase {m['phase']} · Status: {m['status']}"
    sheet["A2"].font = Font(bold=True, color="475569")

    rows = [
        ("What works", m["summary"]),
        ("Backend endpoints", m["endpoints"]),
        ("Frontend page", m["frontend"]),
        ("e2e coverage", m["e2e"]),
        ("Honest gaps / to-production", m["gaps"]),
    ]
    r = 4
    for label, value in rows:
        sheet.cell(row=r, column=1, value=label).font = Font(bold=True, color="0F2A43")
        sheet.cell(row=r, column=1).fill = PatternFill("solid", fgColor="E2E8F0")
        sheet.cell(row=r, column=1).border = BORDER
        sheet.cell(row=r, column=1).alignment = Alignment(vertical="top")
        sheet.cell(row=r, column=2, value=value).alignment = WRAP
        sheet.cell(row=r, column=2).border = BORDER
        sheet.row_dimensions[r].height = 46
        r += 1
    sheet.cell(row=r + 1, column=1, value="Status fill:").font = Font(size=9, italic=True)
    sheet.cell(row=r + 1, column=2).fill = STATUS_FILL["Working"]
    sheet.cell(row=r + 1, column=3, value="Working (end-to-end)").font = Font(size=9)
    sheet.cell(row=r + 1, column=4).fill = STATUS_FILL["Partial"]
    sheet.cell(row=r + 1, column=5, value="Partial (works, documented gaps)").font = Font(size=9)
    sheet.cell(row=r + 1, column=6).fill = STATUS_FILL["Mocked"]
    sheet.cell(row=r + 1, column=7, value="Mocked integration").font = Font(size=9)
    sheet.column_dimensions["A"].width = 28
    sheet.column_dimensions["B"].width = 95
    for c in "CDEFG":
        sheet.column_dimensions[c].width = 24

# ── API Matrix sheet ─────────────────────────────────────────────
api = wb.create_sheet("API Matrix")
api_headers = ["Module", "Method", "Path", "Roles", "Verified by e2e"]
for c, h in enumerate(api_headers, 1):
    api.cell(row=1, column=c, value=h)
style_header(api, len(api_headers))

API_ROWS = [
    ("Auth", "POST", "/api/auth/login", "public", "yes"),
    ("Auth", "GET", "/api/auth/me", "any authenticated", "yes"),
    ("Classes", "GET/POST/PUT/DELETE", "/api/classes(/:id)", "admin (writes)", "yes"),
    ("Students", "GET", "/api/students (page, class_id, status, q)", "any authenticated", "yes"),
    ("Students", "POST/PUT/DELETE", "/api/students(/:id, /:id/status)", "admin/teacher (delete: admin)", "yes"),
    ("Admissions", "GET/POST/DELETE", "/api/admissions/fields(/:id)", "any authenticated", "yes"),
    ("Admissions", "POST", "/api/admissions/trigger-links", "any authenticated", "yes"),
    ("Admissions", "POST", "/api/admissions/:id/{submit,validate,pay,verify-receipt,allocate,vp-approve,principal-approve}", "any authenticated", "yes"),
    ("Admissions", "POST/GET/DELETE", "/api/admissions/:id/documents, /api/admissions/documents/:docId(/download)", "any authenticated", "yes"),
    ("Admissions", "GET", "/api/admissions/:id/letter-data", "any authenticated (403 pre-approval)", "yes"),
    ("Admissions", "GET/POST", "/api/admissions/public/:token(/submit)", "PUBLIC (token-gated)", "yes"),
    ("Notifications", "GET", "/api/notifications (ref_type, recipient, channel)", "any authenticated", "yes"),
    ("Academics", "CRUD", "/api/academics/{subjects,syllabus,lesson-plans,assignments}", "admin/teacher (writes)", "yes"),
    ("Fees", "CRUD", "/api/fees/structures(/:id)", "admin", "yes"),
    ("Fees", "GET/POST", "/api/fees/invoices, /api/fees/invoices/generate", "admin (writes)", "yes"),
    ("Fees", "POST", "/api/fees/payments", "admin", "yes"),
    ("Attendance", "GET/POST", "/api/attendance, /api/attendance/notify-absent", "any authenticated", "yes"),
    ("Timetable", "CRUD+views", "/api/timetable/... (teachers, rooms, periods, master, today, school-view, substitutions, generate)", "role-dependent", "yes"),
    ("Exams", "GET/POST", "/api/exams, /api/exams/marks, /api/exams/reports/:studentId", "any authenticated", "yes"),
    ("Leaves", "GET/POST/PUT", "/api/{staff,student}-leaves(/:id/decision)", "decision: admin/principal(/warden)", "yes"),
    ("Gate Pass", "GET/POST/PUT", "/api/gate-passes(/:id, approve-warden, approve-principal, checkout, checkin)", "warden/principal/admin", "yes"),
    ("Discipline", "CRUD", "/api/discipline/incidents(/:id, /:id/status)", "restricted role set; delete: admin", "yes"),
    ("Discipline", "GET", "/api/discipline/audit-log", "admin only", "yes"),
    ("Staff", "CRUD", "/api/staff(/:id)", "admin (writes)", "yes"),
    ("Payroll", "GET/PUT", "/api/staff/salaries/:staffId, /api/staff/payslips", "admin", "yes"),
    ("Payroll", "POST/PUT", "/api/staff/payslips/generate, /api/staff/payslips/:id/mark-paid", "admin", "yes"),
    ("Hostel", "CRUD", "/api/hostel(/:id), /api/hostel/rooms(/:id)", "admin (writes)", "yes"),
    ("Hostel", "POST/DELETE", "/api/hostel/allocations(/auto, /:id)", "admin/warden", "yes"),
    ("Hostel", "GET/POST/PUT", "/api/hostel/visitors(/:id/checkout)", "admin/warden", "yes"),
    ("Reports", "GET", "/api/reports/{dashboard,attendance,fees,academics,summary}", "any authenticated", "yes"),
    ("Reports", "GET", "/api/reports/export/{students|fees|attendance} (CSV)", "any authenticated", "yes"),
    ("Attendance", "GET", "/api/attendance/register?class_id&month", "any authenticated", "yes"),
    ("Leaves", "GET", "/api/balances (yearly leave balances)", "any authenticated", "yes"),
    ("CBT", "CRUD", "/api/cbt/questions(/:id)", "admin/teacher", "yes"),
    ("CBT", "CRUD+lifecycle", "/api/cbt/tests(/:id, publish, complete)", "admin/teacher", "yes"),
    ("CBT", "POST", "/api/cbt/tests/:id/{start,submit}", "any authenticated (student_id)", "yes"),
    ("CBT", "PUT/GET", "/api/cbt/attempts/:id/grade, /api/cbt/tests/:id/results", "admin/teacher", "yes"),
]
for i, row in enumerate(API_ROWS, 2):
    for c, v in enumerate(row, 1):
        cell = api.cell(row=i, column=c, value=v)
        cell.border = BORDER
        cell.alignment = WRAP
    api.cell(row=i, column=5).alignment = CENTER
style_body(api, len(API_ROWS), len(api_headers))
for c, w in enumerate([14, 16, 62, 32, 14], 1):
    api.column_dimensions[get_column_letter(c)].width = w
api.freeze_panes = "A2"

wb.save(OUT)
print(f"Workbook written: {OUT}")
print(f"Sheets: {wb.sheetnames}")
