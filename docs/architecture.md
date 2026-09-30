# System Architecture Documentation

This document explains the high-level architecture, directory layout, network proxying, and deployment model for the **Genesis ERP** platform.

---

## 🏗️ Core Architecture Pattern

Genesis ERP is structured as a decoupled client-server web application designed to run entirely on Cloudflare's serverless edge networks.

```
+--------------------------------------------------+
|                   Web Browser                    |
+------------------------+-------------------------+
                         |
           HTTPS (Client API Request)
                         v
+------------------------+-------------------------+
|    Cloudflare Pages (Frontend Hosting)           |
|    - Serves static React 19 SPA assets           |
|    - Deployed globally at edge locations         |
+------------------------+-------------------------+
                         |
             Proxy Route (/api/*)
                         v
+------------------------+-------------------------+
|    Cloudflare Workers (Backend API runtime)      |
|    - Hono 4 Router handling logic                |
|    - Ultra-low latency startup (<10ms)           |
+------+-----------------+------------------+------+
       |                 |                  |
       v                 v                  v
+------+------+   +------+------+   +-------+------+
|  CF D1 DDB  |   |  CF R2 Buck |   | CF Email Wk  |
|  (SQLite)   |   | (Obj Store) |   | (Outbound)   |
+-------------+   +-------------+   +--------------+
```

---

## 📂 Directory Layout

The workspace is organized into two primary root-level directories:

```
genesiserp/
├── docs/                     # Developer Documentation (A-to-Z Guide)
├── backend/                  # Hono Backend Application (Cloudflare Worker)
│   ├── src/
│   │   ├── __tests__/        # Backend unit/API tests (Vitest)
│   │   ├── routes/           # Domain-specific route controllers
│   │   │   ├── admissions.ts # Admissions module controller
│   │   │   ├── academics.ts  # Syllabus & assignments controller
│   │   │   ├── attendance.ts # Biometric & manual attendance
│   │   │   ├── communication.ts # Email broadcast controller
│   │   │   ├── finance.ts    # Fee payments and staff payroll
│   │   │   └── staff.ts      # Staff directory and leave requests
│   │   ├── index.ts          # Core Hono application entry point & middlewares
│   │   └── timetable.ts      # Timetable scheduler & substitution algorithm
│   ├── package.json          # Node dependencies & wrangler run scripts
│   ├── schema.sql            # Core database table schemas
│   ├── seed_demo.sql         # Seed scripts containing mock data
│   └── wrangler.jsonc        # Cloudflare worker and D1/R2 binding configuration
└── frontend/                 # React 19 + Vite 8 Frontend Single Page App
    ├── src/
    │   ├── api/
    │   │   └── client.ts     # Global fetch wrapper with automatic auth token injecting
    │   ├── components/       # Global Layout and Auth Guard Components
    │   │   ├── Dashboard.tsx # Main sidebar navigation (AntD ProLayout)
    │   │   └── ProtectedRoute.tsx # Route authentication route guard
    │   ├── features/         # Modular feature views (AntD ProComponents)
    │   │   ├── admissions/   # 9-step admissions form tracker
    │   │   ├── attendance/   # Daily manual attendance tracker
    │   │   ├── auth/         # Login Page and forms
    │   │   ├── exams/        # Mark entries and report card generators
    │   │   ├── finance/      # Fee invoice collections ledger
    │   │   ├── reports/      # Principal live analytics counters
    │   │   └── timetable/    # Live schedule and substitution manager
    │   ├── App.tsx           # Route mapping and global AntD ConfigProvider
    │   └── main.tsx          # React application entry point
    ├── vite.config.ts        # Vite compiler and development server proxy configuration
    └── package.json          # Dependency mappings & compilation scripts
```

---

## 🌐 Network Communication & Proxying

### Production Flow
In production, the frontend is deployed to **Cloudflare Pages** and the backend runs on **Cloudflare Workers**. 
*   Cross-Origin Resource Sharing (CORS) is configured on the Hono backend in [index.ts](file:///d:/genesiserp/backend/src/index.ts#L24-L32) to only whitelist requests arriving from `*.genesiserp-frontend.pages.dev`, `https://genesiserp-frontend.pages.dev`, and `localhost`.

### Development Proxy Flow
To avoid CORS issues and keep configurations simple during local development:
*   The Vite development server is configured in [vite.config.ts](file:///d:/genesiserp/frontend/vite.config.ts#L9-L15) with a proxy route:
    ```typescript
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
    ```
*   When you launch the frontend locally (`http://localhost:5173`) and fetch `/api/students`, the Vite local server intercepts the request and forwards it to `http://localhost:8787/api/students` under the hood.
*   To enable this, the [api client BASE URL](file:///d:/genesiserp/frontend/src/api/client.ts#L1) dynamically falls back to an empty string `""` during development (`import.meta.env.DEV`), utilizing the browser's relative path mechanism to trigger the Vite proxy.

---

## 🚀 Cloudflare Serverless Deployment Model

Deploying the system takes advantage of Cloudflare's serverless infrastructure without dedicated server administration:

1.  **Cloudflare Workers (Backend)**:
    *   Wrangler packages the Hono API and compiles it into a V8 isolate script.
    *   Deployed globally across Cloudflare's edge network, meaning there is zero cold-start delay, and routes scale automatically under heavy traffic.
2.  **Cloudflare D1 (Database)**:
    *   A serverless SQLite database native to Cloudflare.
    *   D1 maintains a light memory footprint and synchronizes changes globally. Query bindings are declared in the backend worker configuration.
3.  **Cloudflare R2 (Object Storage)**:
    *   S3-compatible bucket storage used to save parent-uploaded documents (Aadhar cards, birth certificates).
    *   Bound natively to the backend via Wrangler bindings, bypassing the need for storage API keys.
4.  **Cloudflare Pages (Frontend)**:
    *   Vite builds the static React assets into the `dist/` directory.
    *   Wrangler pushes `dist/` directly to Cloudflare Pages, serving files directly from the edge.
