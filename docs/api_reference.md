# REST API Reference (Hono Router)

This document provides specifications for the REST API endpoints exposed by the **Hono Backend**.

---

## 🔐 Authentication & Middleware

All requests to `/api/*` (except `/api/auth/login` and the CAMS biometric hardware webhook `/api/attendance/cams-webhook`) require a JSON Web Token (JWT) sent via the `Authorization` header:

```http
Authorization: Bearer <JWT_TOKEN>
```

### Role-Based Access Control (RBAC)
Endpoints are guarded by the `requireRole(['allowed_role'])` middleware which checks the decoded JWT payload:
*   `super_admin` & `admin`: Full configuration privileges.
*   `teacher`: Can input attendance, view timetables, and grade tests.
*   `warden`: Access to hostel check-ins, gate passes, and discipline logs.

---

## 👩‍💻 API Endpoints Specifications

### 1. Authentication
*   **POST `/api/auth/login`**
    *   *Payload*: `{ "email": "principal@sainik01.edu", "password": "Demo@Principal1" }`
    *   *Response (200)*: `{ "token": "JWT_STRING", "role": "branch_admin", "branch_id": "br_sainik_01" }`

### 2. Timetable & Substitutions
*   **GET `/api/timetable/teachers`**
    *   *Description*: Retrieves a list of active teachers for the branch.
    *   *Response (200)*: Array of teacher objects including subjects and max periods daily limits.
*   **POST `/api/timetable/teachers`**
    *   *Payload*: `{ "name": "Adam", "email": "adam@gmail.com", "subjects": "Maths", "max_periods_per_day": 3 }`
    *   *Response (201)*: `{ "id": "UUID" }`
*   **PUT `/api/timetable/teachers/:id`**
    *   *Description*: Toggles teacher active state or updates metadata.
    *   *Payload*: `{ "is_active": 0 }`
    *   *Response (200)*: `{ "success": true }`
*   **GET `/api/timetable/master/:classId`**
    *   *Description*: Retrieves the weekly master timetable slots for a class.
    *   *Response (200)*: Array of timetable slot objects sorted by day and period.
*   **GET `/api/timetable/today/:classId`**
    *   *Description*: Fetches today's live schedule, dynamically overlaying any active substitutions.
    *   *Query Parameters*: `date` (optional, YYYY-MM-DD)
    *   *Response (200)*: `{ "date": "YYYY-MM-DD", "day": "Sat", "schedule": [...] }`
*   **GET `/api/timetable/school-view`**
    *   *Description*: Gets a branch-wide view of all class schedules for a date.
    *   *Response (200)*: `{ "date": "YYYY-MM-DD", "classes": [...] }`
*   **POST `/api/timetable/teachers/:id/absent`**
    *   *Description*: Marks a teacher absent for the day, triggering the auto-substitution CSP solver for all their slots.
    *   *Payload*: `{ "date": "YYYY-MM-DD", "reason": "Sick leave" }`
    *   *Response (200)*: `{ "substitutions": [...] }`
*   **POST `/api/timetable/substitute`**
    *   *Description*: Swaps a teacher for a single class period.
    *   *Payload*: `{ "date": "YYYY-MM-DD", "class_id": "cls_10a", "period_number": 3, "original_teacher_id": "T1", "reason": "Accident" }`
    *   *Response (200)*: `{ "substitution_id": "UUID", "assigned_to": { "id": "T2", "name": "Substitute Name" } }`
*   **GET `/api/timetable/substitutions`**
    *   *Description*: Lists all active daily substitutions.
    *   *Response (200)*: Array of substitution overrides.
*   **DELETE `/api/timetable/substitutions/:id`**
    *   *Description*: Revokes an active substitution, reverting the class period back to the primary teacher.
    *   *Response (200)*: `{ "success": true }`
*   **POST `/api/timetable/generate`**
    *   *Description*: Triggers the greedy CSP scheduler to auto-generate a new weekly timetable.
    *   *Payload*:
        ```json
        {
          "class_id": "cls_10a",
          "periods_per_day": 8,
          "working_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          "subjects": [
            { "name": "Mathematics", "teacher_id": "T1", "periods_per_week": 6 }
          ],
          "overwrite": true
        }
        ```
    *   *Response (200)*: `{ "generated": 48, "timetable": [...] }`
    *   *Response (409)*: `{ "error": "Could not generate conflict-free timetable..." }`

---

### 3. Student & Attendance Endpoints
*   **GET `/api/students`**
    *   *Description*: Retrieves students registry (optionally filtered by `class_id` or `status`).
*   **POST `/api/students`**
    *   *Description*: Inserts a new student master record.
*   **POST `/api/attendance`**
    *   *Description*: Marks batch daily attendance for a class.
*   **GET `/api/attendance`**
    *   *Description*: Retrieves attendance status.
*   **POST `/api/attendance/notify-absent`**
    *   *Description*: Sends absence notification emails to parents of absent students.
*   **POST `/api/attendance/cams-webhook`**
    *   *Description*: Hardware biometric punch integration endpoint.
    *   *Header*: `x-api-key: <API_SECRET>`
    *   *Payload*: `{ "RealTime": { "PunchLog": { "UserId": "STUDENT_ADMISSION_NO", "LogTime": "YYYY-MM-DD HH:MM:SS" } } }`

---

### 4. Academics, Finance, Hostel, and Staff Endpoints
*   **GET `/api/academics/assignments`** / **POST `/api/academics/assignments`**: Classroom homework manager.
*   **GET `/api/academics/syllabus`**: Syllabus directories.
*   **POST `/api/finance/payments/offline`**: Collects Cash/Cheque/NEFT and updates fee invoice statuses.
*   **POST `/api/finance/payroll/generate`**: Computes staff payslips with custom override deductions.
*   **POST `/api/hostels/gatepass`**: Requests student leave, generating parent OTPs.
*   **POST `/api/hostels/gatepass/:id/verify-otp`**: Verifies 6-digit parental consent PINs.
*   **POST `/api/hostels/gatepass/:id/approve`**: Warden/Principal digital leave approval signature.
*   **POST `/api/communication/broadcast`**: School-wide parent email notifications.
*   **POST `/api/staff/leaves`** / **GET `/api/staff/leaves`** / **POST `/api/staff/leaves/:id/approve`**: Staff leaves.
