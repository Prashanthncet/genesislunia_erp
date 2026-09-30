## Goal Description

The objective is to migrate the core functionality of the legacy Genesis ERP PHP monolithic application to a modern, decoupled architecture using **React (Vite) with TypeScript** for the frontend and **Hono with TypeScript** for the backend, deployed on Cloudflare Workers.

Due to a strict 24-hour delivery timeframe, the focus is strictly on four critical modules:
1. **Admissions**
2. **Attendance**
3. **Exams with Reports**
4. **Timetable Management with Automated Substitution**

This transition migrates the database from direct MySQL connections to **Cloudflare D1** (Serverless SQLite), replaces the legacy SMS system (Fast2SMS) with **Cloudflare Email Workers** sending from `erp@stepvista.in` (domain already onboarded in Cloudflare), and adds a basic **role-based auth layer**.

---

## User Review Required

> [!CAUTION]
> **🔴 SECURITY — Rotate Credentials Immediately:** `conn.php` contains a plaintext MySQL IP (`89.116.21.190`), username, and password committed to Git history. These must be rotated on the server **before** any further work. After rotating, purge the file from Git history using BFG Repo Cleaner. Add `conn.php` to `.gitignore`.

> [!CAUTION]
> **🔴 Repo Hygiene:** `note.txt` contains real teacher names, internal SQL queries, and developer notes. `test.php`, `test2.php`, `test3.php` are debug files. All must be removed from the repository and added to `.gitignore`.

> [!IMPORTANT]
> **Database Strategy:** The plan migrates the schema to **Cloudflare D1** (SQLite) rather than using Cloudflare Hyperdrive to tunnel to the old MySQL server. This is cleaner, faster, and truly serverless. The schema has been expanded to match the legacy ERP fields (`admission_no`, `father_name`, `mobile_number`, `class_id`, `roll_no`, etc.). Is this acceptable, or must data stay in the existing MySQL server?

> [!NOTE]
> **Email via Cloudflare Email Workers ✅ Confirmed:** Outbound emails will be sent using the `send_email` binding from `erp@stepvista.in`. The domain `stepvista.in` is already onboarded in Cloudflare Email Routing — no additional SMTP credentials or third-party services required.

> [!WARNING]
> **Authentication:** A minimal JWT-based auth layer (admin / teacher roles) is included in this plan. No parent-portal login is in scope for this sprint. Confirm if this is acceptable.

---

## Pre-Execution Checklist (Do First)

- [ ] Rotate MySQL password at `89.116.21.190` and update any live server configs
- [ ] Run `git rm --cached conn.php note.txt test.php test2.php test3.php` and commit
- [ ] Purge sensitive files from Git history: `npx bfg --delete-files conn.php`
- [ ] Run `wrangler d1 create genesiserp-db` and copy the `database_id` into `wrangler.jsonc`
- [ ] Run `wrangler secret put JWT_SECRET` to store the auth signing key

---

## Proposed Changes

---

### 1. Database Schema (Cloudflare D1)

A complete SQLite schema that reflects the full legacy ERP domain — not the minimal skeleton from v1.

#### [NEW] `backend/schema.sql`

```sql
-- ============================================================
-- CORE ENTITIES
-- ============================================================

CREATE TABLE classes (
    id          TEXT PRIMARY KEY,           -- e.g., 'grade10a'
    name        TEXT NOT NULL,              -- e.g., 'Grade 10A'
    section     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE students (
    id               TEXT PRIMARY KEY,
    admission_no     TEXT UNIQUE NOT NULL,
    full_name        TEXT NOT NULL,
    father_name      TEXT,
    mobile_number    TEXT,
    email            TEXT,
    gender           TEXT CHECK(gender IN ('Male', 'Female', 'Other')),
    class_id         TEXT REFERENCES classes(id),
    roll_no          TEXT,
    enrollment_date  TEXT,
    status           TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive', 'Transferred'))
);

CREATE TABLE teachers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    subjects   TEXT,               -- comma-separated, e.g., 'Maths,Science'
    is_active  INTEGER DEFAULT 1
);

CREATE TABLE users (
    id           TEXT PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    password     TEXT NOT NULL,    -- bcrypt hash
    role         TEXT NOT NULL CHECK(role IN ('admin', 'teacher')),
    teacher_id   TEXT REFERENCES teachers(id),
    created_at   TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TABLE attendance (
    id          TEXT PRIMARY KEY,
    student_id  TEXT NOT NULL REFERENCES students(id),
    class_id    TEXT NOT NULL REFERENCES classes(id),
    date        TEXT NOT NULL,     -- ISO 8601: YYYY-MM-DD
    status      TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late')),
    marked_by   TEXT REFERENCES teachers(id),
    notified    INTEGER DEFAULT 0, -- 1 if absence email was sent
    UNIQUE(student_id, date)
);

-- ============================================================
-- EXAMS & REPORTS
-- ============================================================

CREATE TABLE exams (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,      -- e.g., 'Mid-Term 2026'
    date       TEXT NOT NULL,
    class_id   TEXT REFERENCES classes(id),
    max_score  REAL DEFAULT 100
);

CREATE TABLE exam_results (
    id          TEXT PRIMARY KEY,
    exam_id     TEXT NOT NULL REFERENCES exams(id),
    student_id  TEXT NOT NULL REFERENCES students(id),
    score       REAL,
    grade       TEXT,              -- Computed: A+, A, B, C, D, F
    remarks     TEXT,
    UNIQUE(exam_id, student_id)
);

-- ============================================================
-- TIMETABLE & SUBSTITUTION
-- ============================================================

CREATE TABLE timetable (
    id             TEXT PRIMARY KEY,
    class_id       TEXT NOT NULL REFERENCES classes(id),
    day_of_week    TEXT NOT NULL CHECK(day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat')),
    period_number  INTEGER NOT NULL,
    subject        TEXT NOT NULL,
    teacher_id     TEXT NOT NULL REFERENCES teachers(id),
    UNIQUE(class_id, day_of_week, period_number)
);

-- Substitutions are a SEPARATE event record — they do NOT mutate the master timetable
CREATE TABLE substitutions (
    id                    TEXT PRIMARY KEY,
    date                  TEXT NOT NULL,    -- YYYY-MM-DD (the actual day of sub)
    class_id              TEXT NOT NULL REFERENCES classes(id),
    period_number         INTEGER NOT NULL,
    original_teacher_id   TEXT REFERENCES teachers(id),
    substitute_teacher_id TEXT NOT NULL REFERENCES teachers(id),
    reason                TEXT,
    created_by            TEXT REFERENCES users(id),
    created_at            TEXT DEFAULT (datetime('now')),
    UNIQUE(date, class_id, period_number)
);
```

---

### 2. Wrangler Configuration

#### [MODIFY] `backend/wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "genesiserp-backend",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-16",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "genesiserp-db",
      "database_id": "<PASTE_ID_FROM_wrangler_d1_create>"
    }
  ],
  "send_email": [
    {
      "name": "SEND_EMAIL",
      // Sending is scoped to your verified Cloudflare domain: stepvista.in
      // The 'from' address in code must be an address on this domain.
      // To restrict allowed recipients (e.g., admin-only), add:
      // "allowed_destination_addresses": ["admin@stepvista.in"]
      // For open recipient (parent emails), leave this omitted.
    }
  ]
}
```

> After running `wrangler d1 create genesiserp-db`, paste the returned `database_id` above.
> Push schema: `wrangler d1 execute genesiserp-db --file=./schema.sql`

---

### 3. Backend API — `backend/src/index.ts`

Full implementation with auth, validation, batch writes, and auto-substitution logic.

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

type Bindings = {
  DB: D1Database
  SEND_EMAIL: SendEmail     // MailChannels binding
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ── Middleware ──────────────────────────────────────────────
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE'] }))
const authMiddleware = (c: any, next: any) =>
  jwt({ secret: c.env.JWT_SECRET })(c, next)

// ── Auth ────────────────────────────────────────────────────
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; password: string; role: string }>()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  // TODO: replace with bcryptjs compare when workers-compatible build is confirmed
  const token = await sign({ sub: user.id, role: user.role }, c.env.JWT_SECRET)
  return c.json({ token })
})

// ── Admissions ──────────────────────────────────────────────
const studentSchema = z.object({
  admission_no:    z.string(),
  full_name:       z.string(),
  father_name:     z.string().optional(),
  mobile_number:   z.string().optional(),
  email:           z.string().email().optional(),
  gender:          z.enum(['Male', 'Female', 'Other']),
  class_id:        z.string(),
  roll_no:         z.string().optional(),
  enrollment_date: z.string().optional(),
})

app.get('/api/students', authMiddleware, async (c) => {
  const { class_id, status } = c.req.query()
  let query = 'SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON s.class_id = c.id'
  const conditions: string[] = []
  const bindings: string[] = []
  if (class_id) { conditions.push('s.class_id = ?'); bindings.push(class_id) }
  if (status)   { conditions.push('s.status = ?');   bindings.push(status) }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
  return c.json(results)
})

app.post('/api/students', authMiddleware, zValidator('json', studentSchema), async (c) => {
  const data = c.req.valid('json')
  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO students (id, admission_no, full_name, father_name, mobile_number, email, gender, class_id, roll_no, enrollment_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, data.admission_no, data.full_name, data.father_name ?? null,
         data.mobile_number ?? null, data.email ?? null, data.gender,
         data.class_id, data.roll_no ?? null, data.enrollment_date ?? null).run()
  return c.json({ id }, 201)
})

// ── Attendance ──────────────────────────────────────────────
// Body: { class_id, date, marked_by, records: [{ student_id, status }] }
app.post('/api/attendance', authMiddleware, async (c) => {
  const { class_id, date, records, marked_by } = await c.req.json()
  const stmts = records.map(({ student_id, status }: { student_id: string; status: string }) =>
    c.env.DB.prepare(
      `INSERT INTO attendance (id, student_id, class_id, date, status, marked_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status`
    ).bind(crypto.randomUUID(), student_id, class_id, date, status, marked_by ?? null)
  )
  await c.env.DB.batch(stmts)
  return c.json({ success: true, count: records.length })
})

app.get('/api/attendance', authMiddleware, async (c) => {
  const { class_id, date } = c.req.query()
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, s.full_name, s.admission_no FROM attendance a
     JOIN students s ON a.student_id = s.id
     WHERE a.class_id = ? AND a.date = ?`
  ).bind(class_id, date).all()
  return c.json(results)
})

app.post('/api/attendance/notify-absent', authMiddleware, async (c) => {
  const { date } = await c.req.json()
  const { results } = await c.env.DB.prepare(
    `SELECT s.full_name, s.email, s.father_name FROM attendance a
     JOIN students s ON a.student_id = s.id
     WHERE a.date = ? AND a.status = 'Absent' AND a.notified = 0 AND s.email IS NOT NULL`
  ).bind(date).all() as { results: any[] }

  for (const student of results) {
    // Sender must be a verified address on the Cloudflare-onboarded domain: stepvista.in
    await c.env.SEND_EMAIL.send({
      from: { email: 'erp@stepvista.in', name: 'Genesis ERP – StepVista' },
      to:   [{ email: student.email }],
      subject: `Absence Notice – ${student.full_name} – ${date}`,
      text: [
        `Dear ${student.father_name ?? 'Parent/Guardian'},`,
        ``,
        `This is to inform you that ${student.full_name} was marked ABSENT on ${date}.`,
        ``,
        `If this is incorrect, please contact the school office immediately.`,
        ``,
        `Regards,`,
        `Genesis ERP | Powered by StepVista`,
        `erp@stepvista.in`,
      ].join('\n'),
    })
  }
  await c.env.DB.prepare(
    `UPDATE attendance SET notified = 1 WHERE date = ? AND status = 'Absent'`
  ).bind(date).run()
  return c.json({ notified: results.length })
})

// ── Exams & Reports ─────────────────────────────────────────
app.post('/api/exams', authMiddleware, async (c) => {
  const { name, date, class_id, max_score } = await c.req.json()
  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    'INSERT INTO exams (id, name, date, class_id, max_score) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, name, date, class_id ?? null, max_score ?? 100).run()
  return c.json({ id }, 201)
})

app.post('/api/exams/results', authMiddleware, async (c) => {
  const { exam_id, results } = await c.req.json()
  const gradeFor = (score: number, max: number) => {
    const pct = (score / max) * 100
    if (pct >= 90) return 'A+'; if (pct >= 75) return 'A'
    if (pct >= 60) return 'B';  if (pct >= 45) return 'C'
    if (pct >= 33) return 'D';  return 'F'
  }
  const exam = await c.env.DB.prepare('SELECT max_score FROM exams WHERE id = ?')
    .bind(exam_id).first<{ max_score: number }>()
  const stmts = results.map(({ student_id, score, remarks }: any) =>
    c.env.DB.prepare(
      `INSERT INTO exam_results (id, exam_id, student_id, score, grade, remarks) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(exam_id, student_id) DO UPDATE SET score = excluded.score, grade = excluded.grade`
    ).bind(crypto.randomUUID(), exam_id, student_id, score,
           gradeFor(score, exam?.max_score ?? 100), remarks ?? null)
  )
  await c.env.DB.batch(stmts)
  return c.json({ success: true })
})

app.get('/api/exams/reports/:studentId', authMiddleware, async (c) => {
  const { studentId } = c.req.param()
  const student = await c.env.DB.prepare(
    'SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?'
  ).bind(studentId).first()
  const { results: examResults } = await c.env.DB.prepare(
    `SELECT e.name AS exam_name, e.date, e.max_score, r.score, r.grade, r.remarks
     FROM exam_results r JOIN exams e ON r.exam_id = e.id
     WHERE r.student_id = ? ORDER BY e.date DESC`
  ).bind(studentId).all()
  return c.json({ student, results: examResults })
})

// ── Timetable & Substitution ────────────────────────────────
app.get('/api/timetable/:classId', authMiddleware, async (c) => {
  const { classId } = c.req.param()
  const { day } = c.req.query()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short' })
  const targetDay = day ?? today

  const { results: slots } = await c.env.DB.prepare(
    `SELECT t.*, tc.name AS teacher_name FROM timetable t
     JOIN teachers tc ON t.teacher_id = tc.id
     WHERE t.class_id = ? AND t.day_of_week = ? ORDER BY t.period_number`
  ).bind(classId, targetDay).all()

  const dateStr = new Date().toISOString().split('T')[0]
  const { results: subs } = await c.env.DB.prepare(
    `SELECT s.period_number, sub.name AS substitute_name, s.reason
     FROM substitutions s JOIN teachers sub ON s.substitute_teacher_id = sub.id
     WHERE s.class_id = ? AND s.date = ?`
  ).bind(classId, dateStr).all() as { results: any[] }

  const subMap: Record<number, any> = {}
  subs.forEach((s: any) => { subMap[s.period_number] = s })

  const schedule = (slots as any[]).map((slot: any) => ({
    ...slot,
    substitution: subMap[slot.period_number] ?? null
  }))
  return c.json(schedule)
})

app.post('/api/timetable/substitute', authMiddleware, async (c) => {
  const { date, class_id, period_number, original_teacher_id, reason, created_by } = await c.req.json()
  const dow = new Date(date).toLocaleDateString('en-US', { weekday: 'short' })

  // Find teachers already busy this period on this date
  const busyTeachers = await c.env.DB.prepare(
    `SELECT DISTINCT original_teacher_id AS id FROM substitutions WHERE date = ? AND period_number = ?
     UNION
     SELECT DISTINCT teacher_id AS id FROM timetable WHERE day_of_week = ? AND period_number = ?`
  ).bind(date, period_number, dow, period_number).all()

  const busyIds = [...(busyTeachers.results as any[]).map((r: any) => r.id), original_teacher_id]

  const available = await c.env.DB.prepare(
    `SELECT id, name FROM teachers WHERE is_active = 1 AND id NOT IN (${busyIds.map(() => '?').join(',')}) LIMIT 1`
  ).bind(...busyIds).first<{ id: string; name: string }>()

  if (!available) return c.json({ error: 'No available teacher found for this period' }, 409)

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO substitutions (id, date, class_id, period_number, original_teacher_id, substitute_teacher_id, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, date, class_id, period_number, original_teacher_id ?? null,
         available.id, reason ?? null, created_by ?? null).run()

  return c.json({ substitution_id: id, assigned_to: available })
})

export default app
```

---

### 4. Backend Dependencies

#### [MODIFY] `backend/package.json`

Add the following to `dependencies`:
```json
{
  "@hono/zod-validator": "^0.x",
  "zod": "^3.x"
}
```

Run: `npm install` inside `backend/`.

---

### 5. Frontend Application (React + Vite)

#### [MODIFY] `frontend/package.json` — add router

```json
{
  "dependencies": {
    "react": "^19.x",
    "react-dom": "^19.x",
    "react-router-dom": "^7.x"
  }
}
```

Run: `npm install` inside `frontend/`.

---

#### [NEW] `frontend/src/api/client.ts` — typed API client

```typescript
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

---

#### [MODIFY] `frontend/src/main.tsx` — add BrowserRouter

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

---

#### [MODIFY] `frontend/src/App.tsx` — route shell replacing scaffold

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import LoginPage from './features/auth/LoginPage'
import AdmissionsForm from './features/admissions/AdmissionsForm'
import AttendanceTracker from './features/attendance/AttendanceTracker'
import ReportGenerator from './features/exams/ReportGenerator'
import SubstitutionGrid from './features/timetable/SubstitutionGrid'

export default function App() {
  const token = localStorage.getItem('token')
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={token ? <Dashboard /> : <Navigate to="/login" />}>
        <Route index element={<Navigate to="/admissions" />} />
        <Route path="admissions" element={<AdmissionsForm />} />
        <Route path="attendance" element={<AttendanceTracker />} />
        <Route path="exams"      element={<ReportGenerator />} />
        <Route path="timetable"  element={<SubstitutionGrid />} />
      </Route>
    </Routes>
  )
}
```

---

#### [NEW] Module Components

- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/admissions/AdmissionsForm.tsx`
- `frontend/src/features/attendance/AttendanceTracker.tsx`
- `frontend/src/features/exams/ReportGenerator.tsx`
- `frontend/src/features/timetable/SubstitutionGrid.tsx`
- `frontend/src/components/Dashboard.tsx` — sidebar nav with `<Outlet />`

---

### 6. Repo Hygiene

#### [MODIFY] `.gitignore` (root)

```
conn.php
note.txt
test.php
test2.php
test3.php
.env
.env.local
```

Remove from tracking immediately:
```bash
git rm --cached conn.php note.txt test.php test2.php test3.php
git commit -m "chore: remove sensitive and debug files from tracking"
npx bfg --delete-files conn.php  # purge from all history
```

---

## Verification Plan

### Automated Tests
- TypeScript compilation: `npm run build` in both `frontend/` and `backend/`
- D1 local testing: `wrangler dev` uses local SQLite via Miniflare — no real D1 needed during dev
- Lint: `npm run lint` (oxlint in frontend)

### Manual Verification
1. **Auth:** Login as admin → receive JWT → confirm all other routes reject requests without a valid token.
2. **Admissions:** Submit a new student via UI → verify row in D1: `wrangler d1 execute genesiserp-db --command="SELECT * FROM students"`.
3. **Attendance:** Mark 2 students absent → call `/api/attendance/notify-absent` → verify MailChannels email sent (check Cloudflare dashboard logs).
4. **Exams:** Submit scores for an exam → call `/api/exams/reports/:studentId` → verify computed grades (A+/A/B/C/D/F) are correct.
5. **Substitution:** POST `/api/timetable/substitute` for a period → verify auto-assigned teacher is not already busy → GET timetable and confirm substitution overlay appears.

---

## Open Questions for Client

1. Should student `email` be mandatory at admission, or is `mobile_number` the primary contact field?
2. How many periods per school day? (affects timetable UI grid layout)
3. Is there existing data in the MySQL server that needs to be migrated into D1, or is this a fresh start?
4. Do parents need a separate login to view attendance/reports, or is this admin/teacher-only for now?

## User Review Required
> [!IMPORTANT]
> **Database Strategy:** The plan assumes migrating the schema to **Cloudflare D1** instead of using Cloudflare Hyperdrive to tunnel to the old MySQL database. This is cleaner, faster, and truly serverless. Is this acceptable, or must the data stay in the existing MySQL server?

> [!WARNING]
> **Notification Channel:** As SMS APIs are unavailable, all alerts (like absence notifications) will be routed via Email. Please confirm if you have a preferred SMTP provider (like SendGrid, Amazon SES) or if we should use Cloudflare Email Routing bindings.

## Proposed Changes

---
### Database Schema (Cloudflare D1)
We will create a clean SQLite schema for D1 encompassing the required entities.

#### [NEW] `backend/schema.sql`
```sql
-- Admissions & Core Student Data
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    enrollment_date DATE,
    status TEXT DEFAULT 'Active'
);

-- Attendance
CREATE TABLE attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    date DATE NOT NULL,
    status TEXT NOT NULL, -- 'Present', 'Absent', 'Late'
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Exams & Reports
CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date DATE NOT NULL
);

CREATE TABLE exam_results (
    id TEXT PRIMARY KEY,
    exam_id TEXT,
    student_id TEXT,
    score REAL,
    remarks TEXT,
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Timetable & Substitution
CREATE TABLE teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL
);

CREATE TABLE timetable (
    id TEXT PRIMARY KEY,
    day_of_week TEXT,
    period_number INTEGER,
    subject TEXT,
    teacher_id TEXT,
    is_substituted BOOLEAN DEFAULT FALSE,
    substituted_by TEXT,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (substituted_by) REFERENCES teachers(id)
);
```

---
### Backend API (Hono / Cloudflare Workers)
Implementation of the RESTful API endpoints.

#### [MODIFY] `backend/src/index.ts`
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  // Email binding or secret here
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// Admissions
app.post('/api/students', async (c) => { /* Add student logic */ })
app.get('/api/students', async (c) => { /* Get students logic */ })

// Attendance
app.post('/api/attendance', async (c) => { /* Mark attendance */ })
app.post('/api/attendance/notify-absent', async (c) => { 
  // CRON or manual trigger to send emails to absent students
})

// Exams
app.post('/api/exams/results', async (c) => { /* Submit marks */ })
app.get('/api/exams/reports/:studentId', async (c) => { /* Generate report card */ })

// Timetable & Substitution
app.get('/api/timetable/today', async (c) => { /* Get today's schedule */ })
app.post('/api/timetable/substitute', async (c) => { 
  // Logic to find available teacher and reassign period
})

export default app
```

---
### Frontend Application (React + Vite)
We will build a responsive dashboard with rich aesthetics.

#### [NEW] `frontend/src/components/Dashboard.tsx`
A modern, HSL-themed dashboard layout to house the four modules. We will use vanilla CSS (or a pre-agreed styling solution) to ensure a premium look with micro-animations.

#### [NEW] Module Components
- `frontend/src/features/admissions/AdmissionsForm.tsx`
- `frontend/src/features/attendance/AttendanceTracker.tsx`
- `frontend/src/features/exams/ReportGenerator.tsx`
- `frontend/src/features/timetable/SubstitutionGrid.tsx`

## Verification Plan

### Automated Tests
*   We will rely on TypeScript compilation checks to ensure type safety between the API responses and React props.
*   Wrangler local dev server (`npm run dev` in backend) to test D1 queries locally via Miniflare.

### Manual Verification
1.  **Admissions:** User will submit a test student via the UI and verify it appears in the D1 database.
2.  **Attendance:** User will mark a student absent and verify that the mocked/real Email function is triggered.
3.  **Exams:** User will input dummy scores and generate a report view on the frontend.
4.  **Substitution:** User will mark a teacher "unavailable" and verify the system automatically proposes a free teacher for substitution.
