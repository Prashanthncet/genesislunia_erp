"""Add indexes to prisma/schema.prisma for the filters used on hot query paths.

The schema previously had ONLY unique constraints. Every other lookup the app
performs — "students in this class", "attendance for this class+date", "unpaid
invoices for this branch" — was a full table scan. These are the indexes that
make those queries index seeks instead.

Idempotent: each model block is only rewritten if it lacks the index already.
"""
import pathlib
import re
import sys

SCHEMA = pathlib.Path(__file__).resolve().parents[1] / "backend" / "prisma" / "schema.prisma"

# model name -> index lines to insert just before the closing @@map of that model
INDEXES = {
    "Student": ["@@index([branchId, status])", "@@index([classId])", "@@index([branchId, fullName])"],
    "AttendanceRecord": ["@@index([branchId, classId, date])", "@@index([branchId, date, status])", "@@index([classId, date])"],
    "FeeInvoice": ["@@index([branchId, status])", "@@index([studentId])", "@@index([branchId, dueDate])", "@@index([branchId, studentId, term])"],
    "OfflinePayment": ["@@index([invoiceId])", "@@index([branchId, paymentDate])"],
    "FeeStructure": ["@@index([branchId, classId])"],
    "Incident": ["@@index([branchId, status])", "@@index([branchId, incidentDate])", "@@index([studentId])"],
    "TimetableSlot": ["@@index([classId, dayOfWeek])", "@@index([teacherId, dayOfWeek, periodNumber])"],
    "Substitution": ["@@index([date])"],
    "ExamMark": ["@@index([examId, studentId])"],
    "Payslip": ["@@index([branchId, monthYear, status])", "@@index([status])"],
    "StaffLeave": ["@@index([branchId, status])", "@@index([staffId, status])"],
    "StudentLeave": ["@@index([branchId, status])", "@@index([studentId, status])"],
    "GatePass": ["@@index([branchId, status])", "@@index([studentId])"],
    "HostelAllocation": ["@@index([roomId])"],
    "Room": ["@@index([hostelId])"],
    "NotificationLog": ["@@index([branchId, createdAt])", "@@index([channel])"],
    "AuditLog": ["@@index([branchId, createdAt])", "@@index([entity, entityId])"],
    "VisitorLog": ["@@index([branchId, inTime])", "@@index([outTime])"],
    "Syllabus": ["@@index([classId, subjectId])"],
    "LessonPlan": ["@@index([teacherId, date])"],
    "Assignment": ["@@index([classId, dueDate])"],
    "Admission": ["@@index([branchId, status])"],
    "CbtQuestion": ["@@index([classId, subjectId])"],
    "CbtAttempt": ["@@index([testId, status])"],
}


def find_model_block(src: str, model: str):
    """Return (start, end) offsets of the model's body including its closing brace."""
    m = re.search(rf"^model {model} \{{$", src, re.MULTILINE)
    if not m:
        return None
    start = m.start()
    depth = 0
    i = src.index("{", start)
    while i < len(src):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i
        i += 1
    return None


src = SCHEMA.read_text(encoding="utf-8")
added, skipped = [], []

for model, idx in INDEXES.items():
    block = find_model_block(src, model)
    if not block:
        skipped.append((model, "model not found"))
        continue
    start, end = block
    body = src[start:end]
    missing = [i for i in idx if i not in body]
    if not missing:
        skipped.append((model, "already indexed"))
        continue

    # Insert right before the final @@map line so Prisma's convention holds.
    map_match = re.search(r"^  @@map\(", body, re.MULTILINE)
    if map_match:
        insert_at = map_match.start()
        new_body = body[:insert_at] + "".join(f"  {line}\n" for line in missing) + body[insert_at:]
    else:
        # No @@map — append at end of block.
        new_body = body.rstrip() + "\n" + "".join(f"  {line}\n" for line in missing) + "\n"

    src = src[:start] + new_body + src[end:]
    added.append((model, len(missing)))

SCHEMA.write_text(src, encoding="utf-8")

print(f"indexes added to {len(added)} models:")
for m, n in added:
    print(f"  + {m}: {n}")
if skipped:
    print(f"skipped {len(skipped)}:")
    for m, why in skipped:
        print(f"  - {m}: {why}")

sys.exit(0)