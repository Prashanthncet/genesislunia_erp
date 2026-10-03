"""Third codemod pass: give every unlabelled filter <select> an accessible name.

Each select is identified by its React state variable, which describes it
accurately (e.g. `value={genClass}` -> aria-label="Class to invoice").
Idempotent: skips selects that already carry an aria-label.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "src" / "app"
PAGES = [
    "(dashboard)/academics/page.tsx", "(dashboard)/cbt/page.tsx", "(dashboard)/discipline/page.tsx",
    "(dashboard)/fees/page.tsx", "(dashboard)/hostel/page.tsx", "(dashboard)/leaves/page.tsx",
    "(dashboard)/timetable/page.tsx", "(dashboard)/staff/page.tsx", "(dashboard)/admissions/page.tsx",
]

LABELS = {
    "sLevel": "Subject level",
    "syClass": "Class", "sySubject": "Subject",
    "lpSyllabus": "Syllabus unit", "lpTeacher": "Teacher",
    "aClass": "Class", "aSubject": "Subject", "aTeacher": "Teacher",
    "qType": "Question type", "qSubject": "Subject", "qClass": "Class",
    "tClass": "Class", "tSubject": "Subject", "resultsTest": "Test",
    "iStudent": "Student",
    "sfClass": "Class", "genClass": "Class", "payInvoice": "Invoice", "payMode": "Payment mode",
    "rHostel": "Hostel", "allocStudent": "Student", "allocRoom": "Room",
    "slStaff": "Staff", "slType": "Leave type",
    "stStudent": "Student", "stType": "Leave type",
    "gpStudent": "Student", "gpType": "Pass type", "otpPass": "Checked-out pass",
    "salStaff": "Staff",
}

# `<select value={var} ...` on one line, without an existing aria-label
PATTERN = re.compile(r'<select (?![^>]*aria-label)(value=\{(' + "|".join(LABELS) + r')\})([^>]*)>')

changed = []
for rel in PAGES:
    p = ROOT / rel
    src = original = p.read_text(encoding="utf-8")
    src = PATTERN.sub(lambda m: f'<select value={{{m.group(2)}}} aria-label="{LABELS[m.group(2)]}"{m.group(3)}>', src)
    if src != original:
        p.write_text(src, encoding="utf-8")
        changed.append(rel)

print("updated:", len(changed))
for c in changed:
    print("  -", c)