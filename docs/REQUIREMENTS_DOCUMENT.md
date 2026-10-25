# Genesis Lumia ERP — Requirements Document
### Plain-English guide for Sainik School (and anyone who will use or review the system)

> This document explains, in everyday language, **what the school management system must do**.
> No coding knowledge is needed to read it. Every section answers three simple questions:
> *What is it? Who uses it? What does it store and how does it work?*

**Version:** Final · **Prepared for:** Sainik School office, principal, teachers and wardens
**System name:** Genesis Lumia ERP · **Covers:** 13 modules of the school delivery plan

---

## 1. The problem this system solves

Running a school on paper and spreadsheets causes the same problems every year: a student's record
is in three places, a parent asks for a fee receipt and the office cannot find it, a teacher is
absent and nobody knows who will take the class, an admission sits "somewhere" for three weeks.

This system puts **everything in one place**. A student admitted this year, their attendance,
their fees, their hostel room, their marks and any discipline case are all part of **one record**
that anyone in the office can find in seconds — but only if they are allowed to see it.

## 2. Who uses the system (the five roles)

| Role | Plain meaning | What they can do |
|---|---|---|
| **Admin** | The person who owns the system | Everything, in every module, including deleting records and viewing the audit trail |
| **Principal / Branch Admin** | The head of the school office | Approve admissions, approve leave, approve salaries, view all reports, delete records |
| **Teacher** | Teaching staff | Mark attendance, upload assignments and lesson plans, report discipline incidents, view students |
| **Warden** | Hostel and gate staff | Manage hostel rooms and visitors, approve gate passes, view discipline records |
| **Parent** | A student's parent or guardian | Fills in and submits the admission form using a private link they receive by SMS or email |

**One simple rule the system always follows:** *you only ever see your own school's data.* Even if
two schools use this same software, neither can see the other's students, fees or staff.

---

## 3. How to use it day to day

1. **Sign in** on the login screen with the email and password issued by the school. (The login
   screen has one-click demo logins for each role, so you can try every role instantly.)
2. The **left sidebar** groups everything into five areas: Overview, Academics, Operations, People
   & Safety, and Insights. The page you are on is highlighted.
3. The **Dashboard** (home) shows what needs attention today: pending leave requests, gate passes
   waiting for approval, open discipline cases, unpaid fees, attendance levels, and the most recent
   messages sent to parents.
4. Every module page follows the same simple pattern: **filters at the top, list in the middle,
   actions on the right.** Green buttons do the main job; pale buttons do smaller jobs; red buttons
   delete (and only administrators see those).

---

## 4. The 13 modules — what each one must do

### 4.1 Admissions — from "apply" to "enrolled"
**What it is:** The full journey of a new student, from first contact to becoming an official student.

**Who uses it:** The admission office starts it; the parent completes it; the office validates, collects
fees, allocates a roll number and house, the Vice Principal and Principal approve, and the student
record is created.

**What it stores:** Parent name, mobile number, email, the child's name and date of birth, uploaded
documents (Aadhaar, photo, marksheet, birth certificate), payment status, roll number, house, and the
full answers to the school's custom form questions.

**How it works (step by step):**
1. The office types parent names and contacts and presses **"Trigger Parent Links"**.
2. The system creates a **private link** for each parent (a web page they can open on their phone)
   and records the message that was sent to them.
3. The parent opens the link, fills the form and submits. The office's list moves to
   **"Submitted by Parent"**.
4. The office checks the uploaded documents and either **validates** them or asks for a re-submission.
5. Fee payment is recorded and verified by the accounts section.
6. The system allocates a **roll number** and a **house** (see the rules in section 5).
7. Vice Principal approves, then the Principal approves.
8. The system automatically creates the student's master record with the roll number and house — no
   re-typing, no duplicate entries.
9. The office can **print the admission letter** once the Vice Principal has approved.

**Rules it enforces:** you cannot jump ahead in the approval order; documents are limited to 2 MB each;
the admission letter can only be printed after VP approval.

---

### 4.2 Students — the master record
**What it is:** One trusted record per student for their whole time at the school.

**What it stores:** Admission number, full name, father's and mother's names, mobile, email, gender,
blood group, class, roll number, house, enrolment date, status (Active/Inactive).

**How it works:** Staff can search by name, filter by class or status, and page through long lists.
Opening a student's profile shows their **true attendance percentage** (counted from every record on
file, not just the last 30 days), exam marks, hostel room, and all their fee invoices. Staff with the
right role can edit details, mark a student inactive, or delete a record.

**Rules it enforces:** one admission number per student per school (duplicates are blocked); deleting a
class that still has students is blocked; only admins can delete.

---

### 4.3 Parent communication — every message in one log
**What it is:** The single place where every SMS, email and WhatsApp message to parents is recorded.

**How it works:** Whenever the system needs to tell someone something — an admission link, an absence
alert, a leave decision, a gate pass, a new assignment, an incident — it sends (or prepares) the
message and writes it here. Staff can filter the log by channel or by the subject area.

**Important honesty note:** messages are *recorded and shown correctly*, but actual delivery to a
phone number requires the school to connect a messaging provider (one setting in the system). Until
then, the log honestly marks each message as "mocked" rather than pretending it was sent.

---

### 4.4 Fees — structures, invoices, receipts
**What it is:** Deciding what each class must pay, billing it, and recording what was actually paid.

**What it stores:** Fee structures (e.g. "Class 10 Tuition ₹45,000"), invoices (numbered `INV-2026-0001`),
payments (numbered `RCPT-2026-0001`) with amount, mode (cash/cheque/UPI/bank), reference number, date
and the staff member who collected it.

**How it works:**
1. The office defines fee heads per class.
2. **Generate Invoices** creates one invoice for every active student of a chosen class for a term
   (running it twice never double-charges).
3. Money received is entered as a payment. The invoice status updates automatically:
   **Unpaid → Partially Paid → Paid.**
4. A printable receipt shows every payment line with its receipt number.

**Rules it enforces:** you cannot pay more than the balance due (the system refuses and explains why);
the same term is never billed twice to the same student.

---

### 4.5 Attendance — daily marking and monthly registers
**What it is:** Recording who is present each day, and seeing patterns over a month.

**How it works:** A teacher picks a class and a date, marks each student Present, Absent or Late (with
an "All Present" shortcut), and saves. The office can send absence notices to parents in one click.
The **Monthly Register** shows the whole month at a glance — every student against every day — with
each student's attendance percentage.

---

### 4.6 Timetable & substitution — who teaches when
**What it is:** The class timetable plus automatic cover when a teacher is absent.

**How it works:** Teachers, rooms and periods are maintained, then periods are assigned to classes.
When a teacher is marked absent, the system finds free teachers who can teach that subject at that
period and generates the substitutions automatically; the school can review and delete them. The
"school view" shows everything at once, and "today's view" shows each class's day.

---

### 4.7 Leave & gate pass — time off and leaving campus
**What it is:** Requesting and approving leave, and the paperwork for students who leave the campus.

**How it works:**
- **Staff leave:** a teacher requests leave; the Principal approves or rejects; the applicant is
  notified; a yearly balance (e.g. 12 casual days) is tracked automatically.
- **Student leave:** same flow, decided by the Principal or Warden.
- **Gate pass:** issued with an automatic one-time code sent to the parent. The pass moves through
  **Warden approval → Principal approval → Checked Out → Check-in (verified by the parent's code) →
  Returned.**

**Rules it enforces:** a leave request cannot be decided twice; a pass must be fully approved before a
student leaves; a wrong parent code is rejected at check-in.

---

### 4.8 Discipline & safeguarding — incidents, privately
**What it is:** Recording incidents about students with strict limits on who can see them.

**What it stores:** Incident date, description, action taken, demerits, status (Open / Under Review /
Closed), confidential notes, and who reported it.

**How it works:** Staff report an incident; the parents receive a short, fact-free message; the case
moves through Open → Under Review → Closed. **Every single action is written to an audit log** —
including who merely *viewed* a safeguarding record — and only admins can read that log.

**Rules it enforces:** only approved roles can open the module at all; confidential notes are never
included in parent messages.

---

### 4.9 Academics — what is taught and what is due
**What it is:** Subjects, the syllabus units of each subject, lesson plans and assignments.

**How it works:** The office maintains subjects (each with a unique code); teachers add syllabus units,
plan lessons against them, and publish assignments with due dates. Publishing an assignment notifies
guardians. A subject with marks or syllabus attached cannot be deleted (protects the history).

---

### 4.10 Reports & dashboards — the numbers for the meeting
**What it is:** One-click answers to the questions the school asks most often.

**What it provides:**
- A dashboard of headline numbers (students, staff, pending items, fee collection).
- Attendance percentage per class.
- Fees: invoiced vs collected vs outstanding, with a collection percentage.
- Exam averages per exam.
- Hostel occupancy and total payroll cost.
- One-click **CSV downloads** of students, fees and attendance for use in Excel.

---

### 4.11 Hostel — rooms, beds, moves and visitors
**What it is:** Who sleeps where, and who is visiting.

**How it works:** The office creates hostels and rooms with a bed capacity, then allocates students
either manually (the system refuses to over-fill a room) or automatically (it picks the room with the
most free beds). Every room **move is recorded in the audit trail** ("Room 101 → Room 102"). Visitors
are checked in with an automatic pass number and checked out at the gate.

---

### 4.12 Staff & payroll — who works here and what they are paid
**What it is:** Staff records, pay structure, and monthly payslips.

**How it works:**
1. Staff are added with a name, email, role and subjects taught.
2. A pay structure is set: basic salary, HRA, DA, TDS %, EPF %.
3. **Generate Payslips** for a month calculates: gross salary → TDS and EPF deducted →
   **unpaid-leave days deducted automatically** (basic ÷ 30 per day, taken from approved unpaid leave) →
   net salary.
4. Each payslip can be marked "Paid". Running the month twice never pays anyone twice.

**Rules it enforces:** staff with teaching or payslip history are never hard-deleted (only made
inactive, so their history survives); only admins change salaries or run payroll.

---

### 4.13 CBT — computer-based tests
**What it is:** Online tests with the answers stored safely and timed by the server, not the student.

**How it works:** Teachers build a question bank (multiple-choice and written questions). They create
a test from selected questions, set a duration and publish it. When a student starts the test the system
opens a timed window; **the server closes the window on time even if the student's computer is
modified**, and answers are never shown in the student's copy. Multiple-choice answers are marked
immediately; written answers go into a teacher's marking queue, and when the teacher awards marks the
total is recalculated. The school sees a ranked result list.

---

## 5. Business rules the system must never break

| Rule | Why it matters |
|---|---|
| Roll numbers follow the format **CLASS-YEAR-SEQUENCE** (e.g. `10A-2026-007`) | Sorts correctly and never clashes, even when run repeatedly |
| Houses are filled **least-occupied first** | Keeps houses balanced across Red, Blue, Green and Yellow |
| One admission number per student per school | Prevents duplicate student records |
| A fee payment can never exceed the balance | Prevents over-collection and refund confusion |
| The same student is never billed twice for the same term | Protects parents from duplicate demand |
| A leave request cannot be decided twice | Keeps the record honest |
| A gate-pass check-in requires the parent's one-time code | Proves the student actually came back |
| Marks, syllabus and attendance can never be silently deleted | Academic history stays trustworthy |
| Payroll for the same month can never run twice | Nobody is paid twice by accident |
| Only approved roles may open discipline records | Safeguarding privacy |
| Every view and change to a safeguarding record is logged | Someone is always accountable |
| Students can never be told the answers before a test | Test integrity |
| One school can never see another school's data | Privacy between branches |

---

## 6. What the system does **not** do (honest list)

To avoid surprises, these are *not* part of the current system:

1. **It does not send real SMS or email by itself** — it records every message and can deliver through a messaging provider once the school connects one.
2. **It does not take money online** — fees are recorded from offline (cash/cheque/UPI) collection. A payment gateway would need to be added with the bank's merchant account.
3. **It does not generate PDF files server-side** — letters and receipts open as printable pages (like printing from a browser).
4. **It does not calculate Indian income-tax slabs** — TDS and EPF are simple percentage rates set per staff member.
5. **It does not store large files forever** — uploaded documents are held inside the database with a 2 MB limit per file (a production system would use proper file storage).
6. **It does not run on multiple servers at once yet** — it is designed for one school; scaling to a shared deployment would need a different database.
7. **It does not have a parents' login area yet** — parents fill in admission forms using a private link; a full parent portal would be a future step.
8. **The CBT test screen for students** currently exists as a proven testing engine; the polished student screen with a visible countdown is the next build step.

---

## 7. Words used in this document

| Word | Meaning |
|---|---|
| **Branch** | One school using the system (this document describes "Sainik School") |
| **Roll number** | The student's official number inside a class |
| **House** | The group (Red/Blue/Green/Yellow) a student belongs to |
| **Term** | Part of the school year, e.g. "Term 1" |
| **Invoice** | A bill sent to a parent for fees |
| **Receipt** | Proof that a payment was taken |
| **Pay structure** | How a staff member's salary is built up |
| **Payslip** | The monthly salary document |
| **Gate pass** | Permission for a student to leave and return to campus |
| **OTP / parent code** | A one-time number that proves the parent is expecting the return |
| **CBT** | Computer Based Test — an online exam |
| **Audit log** | The record of who did what, and who looked at what |
| **Demerit** | A mark against a student for misconduct |

---

## 8. How the school can check the system is working

Every module has been automatically tested by a repeatable test suite of **84 checks** that run
against a real database. The checks include the happy paths *and* the protection rules: wrong
passwords, unknown records, duplicate numbers, payments that are too large, approvals in the wrong
order, wrong parent codes, and repeated payroll runs. The suite is re-run before every release and
must be fully green, so the school can trust that a change has not broken an earlier feature.

---

*End of document. For questions on any section, contact the system administrator with the section
number above.*