# Genesis ERP — Developer Documentation

Welcome to the official developer documentation for **Genesis ERP**. This project is a modernized, serverless School ERP system migrated from a legacy PHP monolith to a decoupled edge-ready React + Hono architecture.

This documentation folder provides a comprehensive, A-to-Z guide to the repository's frontend, backend, database schema, architecture, APIs, and functional modules.

---

## 📂 Documentation Directory

To explore specific parts of the project, navigate through the following documents:

1.  **[System Architecture](file:///d:/genesiserp/docs/architecture.md)**: Cloudflare serverless edge infrastructure, deployment workflows, and network proxying.
2.  **[Database Schema (D1)](file:///d:/genesiserp/docs/database_schema.md)**: Detailed breakdown of the D1 SQLite database tables, relationships, constraints, and migrations.
3.  **[API Reference](file:///d:/genesiserp/docs/api_reference.md)**: Specifications for all Hono-based REST API endpoints, parameters, responses, and role-based access.
4.  **[Frontend Design System](file:///d:/genesiserp/docs/frontend_design.md)**: React 19 codebase layout, state management, Ant Design Pro tokens, CSS variables, and responsiveness.
5.  **[Admissions & SIS (Modules 1 & 2)](file:///d:/genesiserp/docs/module_admissions.md)**: The 9-step parent-staff onboarding workflow, dynamic field builder, and student master profiles.
6.  **[Academics & Attendance (Modules 3 & 4)](file:///d:/genesiserp/docs/module_attendance_academics.md)**: Lesson planners, homework assignments, and CAMS biometric hardware integration.
7.  **[Hostel & Gate Pass (Modules 5 & 7)](file:///d:/genesiserp/docs/module_hostel_gatepass.md)**: Room allocations, parent OTP verification flow, and tiered Warden-Principal approvals.
8.  **[Timetable & Substitutions (Module 6)](file:///d:/genesiserp/docs/module_timetable_sub.md)**: The greedy CSP backtracking scheduler and automated daily teacher substitution logic.
9.  **[Finance, Payroll & Communication (Modules 8, 9 & 10)](file:///d:/genesiserp/docs/module_finance_payroll.md)**: Offline fee invoice ledger, staff salary slips with TDS/EPF overrides, and parent email broadcasts.
10. **[Discipline, Staff & Dashboard (Modules 11, 12 & 13)](file:///d:/genesiserp/docs/module_discipline_staff_dashboard.md)**: Demerit incident logs, staff leave approvals, and the Principal's real-time analytics dashboard.

---

## ⚡ Quick Start for Local Development

### Prerequisites
*   Node.js v18+ and npm v9+
*   Cloudflare Wrangler CLI (`npm i -g wrangler`)

### Step 1: Clone & Install Dependencies
```powershell
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 2: Initialize D1 SQLite Database (Local)
Run from the `backend/` folder:
```powershell
npx wrangler d1 execute genesiserp-db --local --file=./schema.sql
npx wrangler d1 execute genesiserp-db --local --file=./seed_demo.sql
```

### Step 3: Run Dev Servers
Open two terminal windows:
*   **Terminal 1 (Backend)**: `cd backend && npm run dev` (starts on port `8787`)
*   **Terminal 2 (Frontend)**: `cd frontend && npm run dev` (starts on port `5173`)

Open [http://localhost:5173/](http://localhost:5173/) in your web browser. Use `principal@sainik01.edu` / `Demo@Principal1` to log in with admin privileges.
