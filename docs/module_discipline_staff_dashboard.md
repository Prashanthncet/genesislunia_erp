# Discipline, Staff & Dashboard (Modules 11, 12 & 13)

This document provides a detailed breakdown of **Module 11 (Discipline & Safeguarding)**, **Module 12 (Staff Management)**, and **Module 13 (Reports & Dashboards)**.

---

## 🛡️ Discipline & Safeguarding (Module 11)

The Discipline module logs student behavioral incidents and demerit points.

### 1. Key Features
*   **Behavioral Incident Logging**: Logs incidents detailing description, date, actions taken, and the reporting staff member (warden/teacher).
*   **Demerit Points Ledger**: Assigns demerit points (e.g. 3 demerit points) to student records.
*   **Audit Trail**: Maintains secure logs for student safeguarding compliance.

### 📂 Key Source Code Reference
*   Frontend Component: [IncidentLog.tsx (Frontend)](file:///d:/genesiserp/frontend/src/features/discipline/IncidentLog.tsx)

---

## 🧑‍💼 Staff Management & Leaves (Module 12)

The Staff module handles employee profiles, role configurations, and leave requests.

### 1. Staff Leaves Approval Workflow
*   **Submit Leave Request**: Staff members log in and submit leave requests, specifying leave type (`Casual`, `Sick`, `Earned`), start date, end date, and reason.
*   **Leave Queue**:
    *   *Teachers/Wardens*: Can view their own submitted leave requests and statuses.
    *   *Admins/Principal*: Can view all pending leave requests for their branch.
*   **Approve / Reject Route**: `POST /api/staff/leaves/:leaveId/approve`
    *   *Permissions*: Restricted to `super_admin` or `branch_admin` roles. The approver submits status (`Approved`/`Rejected`), updating the record in D1.

### 📂 Key Source Code Reference
*   Backend Controller: [staff.ts (Backend)](file:///d:/genesiserp/backend/src/routes/staff.ts)

---

## 📊 Admin Analytics Dashboard (Module 13)

The Reports & Dashboards module aggregates school metrics for administrators.

### 1. Key Features
*   **Live Metrics Counters**: Displays key metrics on the dashboard layout:
    *   *Today's Attendance Rate* (percentage of present students).
    *   *Total Daily Fee Collection* (sums offline payments recorded today).
    *   *Active Gate Passes* (number of students currently out of bounds).
    *   *Pending Staff Leaves* (number of leave requests waiting for sign-off).
*   **Pending Approvals List**: Displays pending gate passes and leave requests requiring action, allowing administrators to click and approve them directly from the dashboard.

### 📂 Key Source Code Reference
*   Frontend Component: [AdminDashboard.tsx (Frontend)](file:///d:/genesiserp/frontend/src/features/reports/AdminDashboard.tsx)
