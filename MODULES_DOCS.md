# Genesis ERP - Module Documentation

This document provides a detailed, module-by-module breakdown of the new React + Hono + Cloudflare D1 architecture.
*Note: The frontend UI components are built using Ant Design Pro (`@ant-design/pro-components`) for a premium SaaS aesthetic.*

---

## 1. Admissions (Module 1)
**Purpose:** Handles end-to-end 9-step onboarding workflow for new students (AO -> Parent -> OS -> Accounts -> VP -> Principal).
- **Backend Schema:** `admissions` table (Tracks 9-step state machine: Pending Approval, Published, Links Sent, Submitted, Document Validated, Fee Approved, Roll No Assigned, VP Approved, Admission Complete, plus `dynamic_data` column for custom fields) and `admission_fields` (Stores dynamic mandatory fields).
- **API Endpoints (`admissions.ts`):** 
  - `GET /api/admissions/fields` & `POST /api/admissions/fields` - (AO) Dynamic Mandatory Fields builder.
  - `GET /api/admissions` - List all applications across states.
  - `POST /api/admissions/setup-fields` - (AO) Send mandatory fields to OS for approval.
  - `POST /api/admissions/trigger-links` - (AO) Generate Parent Login IDs and trigger mock SMS/Email.
  - `POST /api/admissions/:id/submit` - (Parent) Submit dynamic form data and upload documents to Cloudflare R2 bucket.
  - `POST /api/admissions/:id/validate` - (AO) Verify docs & trigger payment link.
  - `POST /api/admissions/:id/pay` - (Parent) Simulate gateway payment.
  - `POST /api/admissions/:id/verify-receipt` - (Accounts) Approve fee.
  - `POST /api/admissions/:id/allocate` - (OS) Auto-generate `CLASS2026SEQ` Roll No & Random House.
  - `POST /api/admissions/:id/vp-approve` - (VP) Review assignments.
  - `POST /api/admissions/:id/principal-approve` - (Principal) Digital sign-off and migrate to Student Master table.
- **Frontend Component:** `AdmissionsForm.tsx` (Interactive tab-based simulation of the entire 9-step workflow, featuring a dynamic field builder for the AO and dynamic form rendering + R2 file uploads for the Parent Portal).

## 2. Student Information System (SIS) (Module 2)
**Purpose:** 360-degree view of a student, including physical metrics and document storage.
- **Backend Schema:** `students` (extended with `blood_group`, `height_cm`, `weight_kg`, `vision`, `father_name`, `mother_name`).
- **Storage:** Cloudflare R2 Bucket (`genesiserp-documents`).
- **Frontend Component:** `StudentProfile.tsx` (Provides document vault for uploading Aadhar cards and Medical forms).

## 3. Academics (Module 3)
**Purpose:** Syllabus tracking and assignment management.
- **Backend Schema:** `syllabus`, `lesson_plans`, `assignments` tables.
- **API Endpoints (`academics.ts`):** 
  - `GET /api/academics/assignments`
  - `POST /api/academics/assignments`
  - `GET /api/academics/syllabus`

## 4. Attendance (Module 4)
**Purpose:** Tracks student daily attendance.
- **Backend Schema:** `attendance` table.
- **API Endpoints (`attendance.ts`):**
  - `POST /api/attendance/cams-webhook` - **Legacy Hardware Integration**. Receives real-time biometric JSON payloads directly from CAMS machines.
  - `GET /api/attendance` - Query attendance by date.
- **Frontend Component:** `AttendanceTracker.tsx`

## 5. Hostel Management (Module 5)
**Purpose:** Manages residential houses, rooms, and bed allocations.
- **Backend Schema:** `hostels`, `rooms`, `hostel_allocations` tables.
- **API Endpoints (`hostel.ts`):** 
  - `GET /api/hostels` - List hostels and warden assignments.

## 6. Timetable & Substitution (Module 6)
**Purpose:** Class schedules and automated teacher substitutions.
- **Backend Schema:** `timetable`, `substitutions` tables.
- **API Endpoints (`timetable.ts`):** 
  - `GET /api/timetable/:classId`
  - `POST /api/timetable/substitute` - Automatically queries for available teachers avoiding schedule conflicts.

## 7. Leave / Gate Pass (Module 7)
**Purpose:** Manages student egress with parent verification.
- **Backend Schema:** `gate_passes` table.
- **API Endpoints (`hostel.ts`):** 
  - `POST /api/hostels/gatepass` - Generates a 6-digit OTP and emails it to the parent for digital signature.
  - `POST /api/hostels/gatepass/:id/verify-otp`
  - `POST /api/hostels/gatepass/:id/approve` - Handles multi-factor approvals (Warden -> Principal for emergencies).

## 8. Fees & Payments (Module 8)
**Purpose:** Offline fee collections and invoicing.
- **Backend Schema:** `fee_structures`, `fee_invoices`, `offline_payments`.
- **API Endpoints (`finance.ts`):** 
  - `POST /api/finance/payments/offline` - Record cash/cheque/NEFT payments.
  - `GET /api/finance/invoices/:student_id`
- **Frontend Component:** `FeeLedger.tsx` (Cashier dashboard for pending balances and receipt generation).

## 9. Parent Communication (Module 9)
**Purpose:** School-wide announcements and alerts.
- **Integration:** Cloudflare Email Workers (replaces Fast2SMS/WhatsApp).
- **API Endpoints (`communication.ts`):** 
  - `POST /api/communication/broadcast` - Send emails to specific classes or entire branches from `erp@stepvista.in`.

## 10. Payroll (Module 10)
**Purpose:** Staff salary generation and deductions.
- **Backend Schema:** `salary_structures`, `payslips`.
- **API Endpoints (`finance.ts`):** 
  - `POST /api/finance/payroll/generate` - Calculates Net Salary dynamically based on TDS and EPF percentages, with support for Admin overrides based on regional tax laws.

## 11. Discipline & Safeguarding (Module 11)
**Purpose:** Log behavioral incidents and demerits.
- **Backend Schema:** `incidents` table.
- **Frontend Component:** `IncidentLog.tsx` (Dashboard to review disciplinary actions).

## 12. Staff Management (Module 12)
**Purpose:** Manages school employees and leave requests.
- **Backend Schema:** `staff` (Warden, Principal, Admin roles), `staff_leaves`.
- **API Endpoints (`staff.ts`):** 
  - `POST /api/staff/leaves`
  - `GET /api/staff/leaves`
  - `POST /api/staff/leaves/:leaveId/approve` - Generic approval hierarchy for HOD/Principal review.

## 13. Reports & Dashboards (Module 13)
**Purpose:** Analytics and aggregates for administration.
- **Frontend Component:** `AdminDashboard.tsx`
- **Description:** Replaces the legacy 5:00 PM cron job script. Pulls live metrics for attendance rates, total fee collections, pending staff leaves, and open gate passes natively in the React interface.

---
*Note: Module 14 (CBT) was intentionally excluded from Phase 1 development as per client instruction.*
