# Genesis ERP — Sainik School

Education ERP for Sainik School. Built with **Next.js 15 + React 19 + Tailwind CSS** (frontend) and **NestJS 11 + Prisma + SQLite** (backend), with Swagger API docs at `/api/docs`.

---

## Architecture

```
genesiserp/
├── frontend/          Next.js 15 (App Router) + TypeScript + Tailwind CSS  →  port 5173
└── backend/           NestJS 11 + Prisma + SQLite                           →  port 3001
```

| Layer    | Technology                                  | URL (dev)                        |
|----------|---------------------------------------------|----------------------------------|
| Frontend | Next.js 15, React 19, Tailwind CSS v4       | `http://localhost:5173`          |
| Backend  | NestJS 11, Express, Swagger                 | `http://localhost:3001/api`      |
| Database | SQLite (via Prisma ORM)                     | `backend/prisma/dev.db`          |
| Auth     | JWT (HS256) Bearer tokens, role-based RBAC  | branch-scoped via `branch_id`    |

---

## Prerequisites

```bash
node --version    # v20+ required (v24 used in development)
npm --version     # v10+
```

---

## Local Development

You need **two terminals** running simultaneously.

### Terminal 1 — Backend (NestJS on port 3001)

```bash
cd backend
npm install
npx prisma db push        # create dev.db from schema.prisma
npx prisma db seed        # load demo data (branches, classes, users, students, timetable…)
npm run start:dev         # watch mode
```

Backend starts at **http://localhost:3001** with global prefix `/api`.
Interactive API docs (Swagger UI): **http://localhost:3001/api/docs**

### Terminal 2 — Frontend (Next.js on port 5173)

```bash
cd frontend
npm install
npm run dev
```

Next.js starts at **http://localhost:5173**.
All `/api/*` requests are automatically proxied to `http://localhost:3001` via `next.config.mjs` rewrites — no CORS issues. Set `BACKEND_URL` to point elsewhere.

> **Open:** http://localhost:5173 in your browser.

---

## Demo Credentials

| Email                     | Password        | Role         |
|---------------------------|-----------------|--------------|
| `admin@sainik01.edu`      | `Admin@123`     | super_admin  |
| `principal@sainik01.edu`  | `Demo@Principal1` | branch_admin |
| `teacher@sainik01.edu`    | `Demo@Teacher1` | teacher      |
| `warden@sainik01.edu`     | `Demo@Warden1`  | warden       |

Branch code: `sainik01`. Seeded classes: `cls_10a`, `cls_10b`, `cls_12_sci`; students `stu_001`–`stu_004`.

---

## Testing

### Backend E2E Tests (Jest + Supertest)

The full API surface is covered by a 48-test in-process e2e suite — auth, classes, students, attendance, exams, timetable (including the CSP auto-generator and substitution engine), and the 9-step admissions workflow.

```bash
cd backend
npm run test:e2e
```

### Frontend

```bash
cd frontend
npm run build     # production build + typecheck
npm run lint      # ESLint
```

---

## Modules

| Module       | Highlights                                                                 |
|--------------|-----------------------------------------------------------------------------|
| Admissions   | Dynamic field builder, 9-step workflow (submit → validate → pay → verify → allocate → VP → principal → student created) |
| Attendance   | Batch marking, absentee alerts, per-class daily register                    |
| Timetable    | Master grid, live day view, manual slot editor, CSP auto-generator (backtracking, conflict-free), teacher absence → bulk substitution, revocation |
| Exams        | Exam + schedule management, mark entry, CBSE-grade report cards             |
| Finance      | Fee structures, invoices, offline payments, salary/payslips                 |
| Hostel       | Rooms, allocations, gate passes                                             |
| Discipline   | Incident log                                                                |
| Reports      | Admin dashboard aggregations                                                |
| Auth         | JWT login, `AuthGuard` + `RolesGuard` with `@Roles()` decorator, branch scoping |

---

## Available Scripts

### Backend (`cd backend`)

| Command                  | Description                                      |
|--------------------------|--------------------------------------------------|
| `npm run start:dev`      | Start NestJS in watch mode on port 3001          |
| `npm run build`          | Compile to `dist/`                               |
| `npm run start:prod`     | Run compiled build (`node dist/src/main`)        |
| `npm run test:e2e`       | Run the 48-test API e2e suite                    |
| `npm run prisma:generate`| Regenerate Prisma Client                         |
| `npm run prisma:migrate` | Create/apply a dev migration                     |
| `npm run seed`           | Seed the database with demo data                 |

### Frontend (`cd frontend`)

| Command           | Description                                            |
|-------------------|--------------------------------------------------------|
| `npm run dev`     | Start Next.js dev server on port 5173 (API rewrites on) |
| `npm run build`   | Production build + typecheck → `.next/`                |
| `npm run start`   | Serve the production build on port 5173                |
| `npm run lint`    | ESLint                                                 |

---

## API Reference

Full interactive reference lives at **http://localhost:3001/api/docs** (Swagger). All endpoints require `Authorization: Bearer <token>` except `/api/auth/login`.

| Method | Path                                    | Description                                     |
|--------|-----------------------------------------|-------------------------------------------------|
| POST   | `/api/auth/login`                       | Login → returns JWT                             |
| GET    | `/api/auth/me`                          | Current user profile                            |
| GET    | `/api/classes`                          | List classes                                    |
| GET    | `/api/students`                         | List students (filter: classId, status)         |
| POST   | `/api/students`                         | Create student                                  |
| POST   | `/api/attendance`                       | Mark batch attendance                           |
| GET    | `/api/attendance`                       | Attendance for class + date                     |
| POST   | `/api/attendance/notify-absent`         | Notify guardians of absentees                   |
| GET    | `/api/exams`                            | List exams                                      |
| GET    | `/api/exams/subjects`                   | List subjects                                   |
| POST   | `/api/exams/marks`                      | Submit exam marks                               |
| GET    | `/api/exams/reports/:studentId`         | Student report card                             |
| GET    | `/api/timetable/teachers`               | List teachers                                   |
| POST   | `/api/timetable/teachers`               | Add teacher                                     |
| PUT    | `/api/timetable/teachers/:id`           | Update teacher                                  |
| GET    | `/api/timetable/rooms`                  | List rooms                                      |
| POST   | `/api/timetable/rooms`                  | Add room                                        |
| PUT    | `/api/timetable/periods`                | Replace period configuration                    |
| PUT    | `/api/timetable/slot`                   | Upsert timetable slot (409 on conflict)         |
| POST   | `/api/timetable/generate`               | Auto-generate timetable (CSP backtracking)      |
| GET    | `/api/timetable/master/:classId`        | Master timetable for a class                    |
| GET    | `/api/timetable/today/:classId`         | Live schedule with substitution overlay         |
| GET    | `/api/timetable/school-view`            | Whole-school schedule for a date                |
| POST   | `/api/timetable/substitute`             | Auto-substitute a single period                 |
| POST   | `/api/timetable/teachers/:id/absent`    | Mark teacher absent → bulk substitutions        |
| GET    | `/api/timetable/substitutions`          | List substitutions for a date                   |
| DELETE | `/api/timetable/substitutions/:id`      | Revoke a substitution                           |
| GET    | `/api/admissions/fields`                | List admission form fields                      |
| POST   | `/api/admissions/fields`                | Create admission field                          |
| DELETE | `/api/admissions/fields/:id`            | Delete admission field                          |
| POST   | `/api/admissions/setup-fields`          | Reset to default field set                      |
| POST   | `/api/admissions/trigger-links`         | Generate application links                      |
| POST   | `/api/admissions/submit`                | Public application submission                   |
| POST   | `/api/admissions/:id/validate`          | Validate application                            |
| POST   | `/api/admissions/:id/pay`               | Record application fee payment                  |
| POST   | `/api/admissions/:id/verify-receipt`    | Verify payment receipt                          |
| POST   | `/api/admissions/:id/allocate`          | Allocate class + section                        |
| POST   | `/api/admissions/:id/vp-approve`        | Vice-principal approval                         |
| POST   | `/api/admissions/:id/principal-approve` | Principal approval → student created            |

---

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma       # Full data model (26 models, snake_case columns via @map)
│   ├── seed.ts             # Demo data: branch, classes, users, students, subjects, timetable
│   └── dev.db              # SQLite database
├── src/
│   ├── main.ts             # Bootstrap: global prefix /api, Swagger, CORS
│   ├── app.module.ts       # Feature module wiring
│   ├── auth/               # AuthGuard, RolesGuard, @Roles(), JWT strategy
│   ├── classes/ students/ attendance/ exams/
│   ├── timetable/          # CSP generator + substitution engine
│   └── admissions/         # 9-step workflow
└── test/
    ├── api.e2e-spec.ts     # 48-test e2e suite
    └── jest-e2e.json

frontend/
├── next.config.mjs         # /api/* rewrites → backend (BACKEND_URL override)
└── src/
    ├── app/
    │   ├── login/          # Login page
    │   └── (dashboard)/    # Protected shell: admissions, attendance, timetable, exams, notifications
    ├── components/         # ProtectedRoute (client-side JWT check), DashboardShell
    └── lib/api.ts          # apiFetch: Bearer auth, JSON/FormData, error unwrapping
```
