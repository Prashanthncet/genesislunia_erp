# Database Schema & Migrations (D1 SQLite)

This document details the database architecture of **Genesis ERP**, which utilizes **Cloudflare D1** (a serverless SQLite database engines). It describes the tables, relationships, integrity constraints, and migration flows.

---

## 🗺️ Schema diagram & Entity Relationships

The schema is structured to support multi-tenancy (via `branch_id` mappings) and maintains strong referential integrity across staff, student records, and transactional logs.

```
+------------------+         +------------------+
|     branches     |         |     classes      |
+------------------+         +------------------+
| id (PK)          |<---+    | id (PK)          |<---+
| name             |    |    | branch_id (FK)   |    |
| location         |    |    | name             |    |
+------------------+    |    | section          |    |
                        |    +------------------+    |
                        |                            |
                        |    +------------------+    |
                        +--->|     students     |    |
                        |    +------------------+    |
                        |    | id (PK)          |    |
                        |    | class_id (FK)    |----+
                        |    | full_name        |
                        |    | admission_no     |
                        |    | ...              |
                        |    +------------------+
                        |
                        |    +------------------+
                        +--->|      staff       |<---+
                             +------------------+    |
                             | id (PK)          |    |
                             | branch_id (FK)   |    |
                             | name, role       |    |
                             | max_periods_p_day|    |
                             +------------------+    |
                                                     |
                             +------------------+    |
                             |    timetable     |    |
                             +------------------+    |
                             | id (PK)          |    |
                             | class_id (FK)    |    |
                             | teacher_id (FK)  |----+
                             +------------------+
```

---

## 📋 Table Definitions & Fields

### 1. Multi-Tenancy & Core Entities

#### `branches`
Stores isolated school branches.
*   `id` (TEXT, PK): Unique branch identifier (e.g., `br_sainik_01`).
*   `name` (TEXT, NOT NULL): Name of the branch.
*   `location` (TEXT): Physical location address.

#### `classes`
Academics grade classrooms scoped per branch.
*   `id` (TEXT, PK): Unique class identifier (e.g., `cls_10a`).
*   `branch_id` (TEXT, FK): References `branches(id)`.
*   `name` (TEXT, NOT NULL): Grade name (e.g., `Class 10`).
*   `section` (TEXT): Section identifier (e.g., `A`).

#### `students`
Master student registry.
*   `id` (TEXT, PK): Unique UUID.
*   `branch_id` (TEXT, FK): References `branches(id)`.
*   `admission_no` (TEXT, NOT NULL): School-assigned admission code. Unique per branch.
*   `full_name` (TEXT, NOT NULL): Student name.
*   `father_name` / `mother_name` (TEXT): Family records.
*   `mobile_number` / `email` (TEXT): Parents' contact information.
*   `height_cm` / `weight_kg` / `vision` (REAL/TEXT): Physical/medical logs.
*   `class_id` (TEXT, FK): References `classes(id)`.
*   `roll_no` (TEXT): Assigned class roster position.
*   `status` (TEXT): Current enrollment state (`Active`, `Inactive`, `Transferred`).

#### `staff`
Master registry for school employees (Teachers, Wardens, Admins).
*   `id` (TEXT, PK): Unique staff code (e.g., `stf_tr_01`).
*   `branch_id` (TEXT, FK): References `branches(id)`.
*   `name` (TEXT, NOT NULL): Full name.
*   `email` (TEXT, NOT NULL): School email address (must be unique per branch).
*   `role` (TEXT, NOT NULL): Staff role (`Teacher`, `Warden`, `Principal`, `Admin`).
*   `subjects` (TEXT): Specializations (comma-separated, e.g. `Mathematics, Physics`).
*   `max_periods_per_day` (INTEGER, Default 6): Max workload limit constraint for teacher timetable scheduler.
*   `is_active` (INTEGER, Default 1): Activity state indicator.

#### `users`
Web portal authorization database accounts.
*   `id` (TEXT, PK): Auth UUID.
*   `branch_id` (TEXT, FK): References `branches(id)`.
*   `email` (TEXT, NOT NULL, UNIQUE): Login ID email.
*   `password` (TEXT, NOT NULL): Bcrypt hashed string.
*   `role` (TEXT, NOT NULL): System authorization level (`super_admin`, `branch_admin`, `teacher`, `warden`).
*   `staff_id` (TEXT, FK): References `staff(id)`.

---

### 2. Timetable & Substitutions

#### `timetable`
Master schedule slots mapping subjects to teachers.
*   `id` (TEXT, PK): Unique slot UUID.
*   `branch_id` (TEXT, FK): References `branches(id)`.
*   `class_id` (TEXT, FK): References `classes(id)`.
*   `day_of_week` (TEXT, NOT NULL): `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, or `Sat`.
*   `period_number` (INTEGER, NOT NULL): Class period index (e.g. `1` to `8`).
*   `subject` (TEXT, NOT NULL): Course title.
*   `teacher_id` (TEXT, FK): References `staff(id)`.
*   **Constraint**: `UNIQUE(class_id, day_of_week, period_number)` ensures no double booking for a class.

#### `substitutions`
Dynamic overrides of the master timetable for specific dates when a primary teacher is absent.
*   `id` (TEXT, PK): Unique entry UUID.
*   `branch_id` (TEXT, FK): References `branches(id)`.
*   `date` (TEXT, NOT NULL): Target override date (YYYY-MM-DD).
*   `class_id` (TEXT, FK): References `classes(id)`.
*   `period_number` (INTEGER, NOT NULL): Period to override.
*   `original_teacher_id` (TEXT, FK): References `staff(id)` (the absent teacher).
*   `substitute_teacher_id` (TEXT, FK): References `staff(id)` (the covering teacher).
*   `reason` (TEXT): Reason for substitution (e.g. `Sick Leave`).
*   `created_by` (TEXT, FK): References `users(id)`.
*   **Constraint**: `UNIQUE(date, class_id, period_number)` restricts a slot to a single substitute.

---

### 3. Other Modules Schema

*   **`admissions`**: Tracks parent signup portal data, document uploads (Cloudflare R2 keys), simulated payment records, and the 9-stage validation state machine.
*   **`admission_fields`**: Configurable mandatory fields generated dynamically by the Admission Officer.
*   **`attendance`**: Daily class logs storing present/absent student records, mapped by date and student.
*   **`subjects`**: Core subjects mapped by grade level (Primary, Secondary, Higher).
*   **`exams` / `exam_marks`**: Tests registry and student test scores (CBSE grading).
*   **`staff_leaves`**: Staff leave requests (Casual, Sick, Earned) and approval states.
*   **`syllabus` / `lesson_plans` / `assignments`**: Academic curriculum tracking.
*   **`hostels` / `rooms` / `hostel_allocations`**: Dormitory and bed space assignments.
*   **`gate_passes`**: Student gate passes, storing parent OTPs and Warden/Principal approval logs.
*   **`incidents`**: Discipline records tracking behavioral demerits.
*   **`fee_structures` / `fee_invoices` / `offline_payments`**: Finance ledgers for invoice creation and payment collections.
*   **`salary_structures` / `payslips`**: Staff monthly gross salaries, deductions, and overrides.

---

## ⚡ Running Database Schema Setup

To create the SQLite database locally, run Wrangler command inside the `/backend` folder:
```powershell
# Create database schema tables
npx wrangler d1 execute genesiserp-db --local --file=./schema.sql

# Seed tables with demo classrooms, teachers, and students
npx wrangler d1 execute genesiserp-db --local --file=./seed_demo.sql
```

To apply these schemas to the live Cloudflare production database, append the `--remote` flag:
```powershell
npx wrangler d1 execute genesiserp-db --remote --file=./schema.sql
npx wrangler d1 execute genesiserp-db --remote --file=./seed_demo.sql
```
