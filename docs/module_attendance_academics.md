# Academics & Attendance (Modules 3 & 4)

This document provides a detailed breakdown of **Module 3 (Academics)** and **Module 4 (Attendance)**.

---

## 📚 Academics Management (Module 3)

The Academics module handles student class materials, lesson planning, and homework assignments.

### 1. Key Features
*   **Syllabus Directories**: Maps curriculum syllabi per class level (e.g. `Class 9-10`) and subject.
*   **Lesson Planners**: Allows teachers to record progress on specific topics (e.g., "Introduction to Quadratic Equations") and mark them as `Planned` or `Completed` to coordinate syllabus completion.
*   **Assignments Manager**: Allows teachers to create homework assignments specifying a title, description, and due date.

### 📂 Key Source Code Reference
*   Backend Controller: [academics.ts (Backend)](file:///d:/genesiserp/backend/src/routes/academics.ts)

---

## 📝 Attendance Tracker & Webhook (Module 4)

The Attendance module handles daily student attendance records using a combination of manual tracking interfaces and biometric hardware integration.

### 1. Legacy Biometric Hardware Integration (CAMS Webhook)
*   **Route**: `POST /api/attendance/cams-webhook`
*   **Description**: Biometric machines (CAMS) located at the school gates are configured to send attendance punches directly to the ERP backend.
*   **Security**: The route is intentionally not protected by JWT since the request originates from hardware. Instead, it requires a pre-shared static API key passed in the header:
    ```http
    x-api-key: <JWT_SECRET>
    ```
*   **Payload parsing**: The machine sends real-time punch logs. The backend parses the payload, identifies the student by their admission number (`UserId`), extracts the punch date, and logs their attendance as `Present` with a marker `SYSTEM_CAMS`:
    ```json
    {
      "RealTime": {
        "PunchLog": {
          "UserId": "SNK-2024-001",
          "LogTime": "2026-07-16 07:30:00"
        }
      }
    }
    ```

### 2. Manual Tracker Interface
*   Allows teachers to manually take attendance or correct biometric logs (e.g., if a student forgot their punch).
*   Records are saved to the database using an `UPSERT` statement (`ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status`).

### 3. Parent Absence Alerts
*   Administrators can trigger a broadcast notification.
*   The backend scans the attendance table for the current date, extracts all students flagged as `Absent` whose parents have not been notified, mocks an email notification, and flags them as `notified = 1` in the database.

### 📂 Key Source Code Reference
*   Backend Controller: [attendance.ts (Backend)](file:///d:/genesiserp/backend/src/routes/attendance.ts)
*   Frontend Component: [AttendanceTracker.tsx (Frontend)](file:///d:/genesiserp/frontend/src/features/attendance/AttendanceTracker.tsx)
