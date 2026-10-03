"""Apply the new validated DTO classes to the attendance / discipline / staff
controllers: swap inline anonymous `@Body()` types for the DTO classes and drop
the manual required-field guards that class-validator now performs.

Idempotent — skips a swap when the DTO is already applied.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1] / "backend" / "src"

# (file, [(old_snippet, new_snippet), ...])
EDITS = {
    "attendance/attendance.controller.ts": [
        (
            "@Body() body: { class_id?: string; date?: string; records?: Array<{ student_id: string; status: string }>; marked_by?: string },\n  ) {\n    const { class_id, date, records, marked_by } = body ?? {};\n    if (!class_id || !date || !Array.isArray(records)) {\n      throw new BadRequestException('class_id, date, and records are required');\n    }\n",
            "@Body() body: MarkAttendanceDto,\n  ) {\n    const { class_id, date, records, marked_by } = body;\n",
        ),
        (
            "@Body() body: { date?: string },",
            "@Body() body: { date?: string },",
        ),
    ],
    "discipline/discipline.controller.ts": [
        (
            "@Body() body: { student_id?: string; incident_date?: string; description?: string; action_taken?: string; demerits?: number; confidential_notes?: string },\n  ) {\n    if (!body?.student_id || !body?.incident_date || !body?.description) {\n      throw new BadRequestException('student_id, incident_date and description are required');\n    }\n",
            "@Body() body: CreateIncidentDto,\n  ) {\n",
        ),
        (
            "@Body() body: { description?: string; action_taken?: string; demerits?: number; confidential_notes?: string },",
            "@Body() body: UpdateIncidentDto,",
        ),
        (
            "@Body() body: { status?: string }) {\n    if (!body?.status || !['Open', 'Under Review', 'Closed'].includes(body.status)) {\n      throw new BadRequestException('status must be Open | Under Review | Closed');\n    }\n",
            "@Body() body: IncidentStatusDto) {\n",
        ),
    ],
    "staff/staff.controller.ts": [
        (
            "@Body() body: { basic_salary?: number; hra?: number; da?: number; tds_percent?: number; epf_percent?: number },\n  ) {\n    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, branchId: req.user.branch_id } });\n    if (!staff) throw new NotFoundException('Staff member not found');\n    if (typeof body?.basic_salary !== 'number' || body.basic_salary <= 0) {\n      throw new BadRequestException('basic_salary (> 0) is required');\n    }\n",
            "@Body() body: SalaryStructureDto,\n  ) {\n    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, branchId: req.user.branch_id } });\n    if (!staff) throw new NotFoundException('Staff member not found');\n",
        ),
    ],
}

# Import lines to prepend after the last existing `import ... from '../<x>/...'`-style line
IMPORTS = {
    "attendance/attendance.controller.ts": "import { MarkAttendanceDto } from '../fees/dto/fees.dto';",
    "discipline/discipline.controller.ts": "import { CreateIncidentDto, IncidentStatusDto, UpdateIncidentDto } from './dto/discipline.dto';",
    "staff/staff.controller.ts": "import { GeneratePayslipsDto, SalaryStructureDto } from '../discipline/dto/discipline.dto';",
}

failed = False
for rel, pairs in EDITS.items():
    p = ROOT / rel
    src = p.read_text(encoding="utf-8")
    for old, new in pairs:
        if new in src and old not in src:
            continue  # already applied
        if old not in src:
            print(f"  !! no match in {rel}: {old.splitlines()[0][:70]}")
            failed = True
            continue
        src = src.replace(old, new, 1)

    imp = IMPORTS[rel]
    if imp not in src:
        lines = src.splitlines(keepends=True)
        last_import = max(i for i, l in enumerate(lines) if l.startswith("import "))
        lines.insert(last_import + 1, imp + "\n")
        src = "".join(lines)

    p.write_text(src, encoding="utf-8")
    print(f"  updated {rel}")

sys.exit(1 if failed else 0)