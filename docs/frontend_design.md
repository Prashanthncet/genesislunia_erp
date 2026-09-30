# Frontend Design & Styling System

This document outlines the design principles, styling architecture, directory layout, and layouts used in the **Genesis ERP Frontend** React Single Page Application (SPA).

---

## 🎨 Design System & Styling Architecture

The frontend UI is built using a combination of **Ant Design Pro Components** and a customized **CSS Custom Properties (Variables) Theme** in custom pages. This approach delivers a premium, high-contrast, professional enterprise appearance.

```
+-------------------------------------------------------+
|                 Ant Design ConfigProvider             |
|                 - primaryColor: #1677ff               |
|                 - borderRadius: 6                     |
+---------------------------+---------------------------+
                            |
                            v
+---------------------------+---------------------------+
|          Ant Design ProComponents Layout              |
|          - ProLayout mix navigation                   |
|          - User Avatar Dropdown                       |
+---------------------------+---------------------------+
                            |
                            v
+---------------------------+---------------------------+
|         Custom Page Modules (e.g. Timetable)          |
|         - Custom CSS variables matching AntD          |
|         - High-contrast elements                      |
|         - Responsive Flexbox/Grid layouts             |
+-------------------------------------------------------+
```

### 1. High-Contrast CSS Variable Theme
To prevent the application from looking "washed out" or having unreadable low-contrast text, custom page modules (such as the Timetable module) use defined styling tokens in [Timetable.css](file:///d:/genesiserp/frontend/src/features/timetable/Timetable.css):
*   **Backgrounds**: `--bg-surface` (`#ffffff`) and `--bg-surface-alt` (`#fafafa`) provide clear container separation.
*   **Borders**: `--border-color` (`#d9d9d9`) and `--border-color-light` (`#f0f0f0`) provide sharp, distinct outlines.
*   **Text Colors**: High-contrast text values are enforced: `--text-primary` (`#1f1f1f`) for headings/content and `--text-secondary` (`#595959`) for descriptions.
*   **States**: Color-coded badges and banners represent system status clearly:
    *   *Success*: `--accent-success` (`#52c41a`)
    *   *Warning/Substitutions*: `--accent-warning-text` (`#d48806`)
    *   *Danger/Errors*: `--accent-danger` (`#ff4d4f`)

### 2. Emojis vs Professional Vector Icons
The user interface avoids emoji indicators in favor of vector icons. We import standard icons directly from `@ant-design/icons`:
*   `CalendarOutlined` / `TableOutlined` (Schedule views)
*   `ThunderboltOutlined` (Auto-generation logic)
*   `UserOutlined` / `UserDeleteOutlined` (Faculty actions)
*   `SwapOutlined` (Substitution exchange)
*   `DeleteOutlined` (Removal commands)
*   `ReloadOutlined` (Recalculating/Processing states)

---

## 📂 Frontend Directory Layout

The `frontend/src` directory is divided into modules:

```
frontend/src/
├── api/
│   └── client.ts             # API client wrapper handling Authorization tokens
├── assets/
│   └── logo.jpeg             # School badge/logo
├── components/
│   ├── Dashboard.tsx         # Main frame layout wrapping child panels
│   └── ProtectedRoute.tsx     # Security router guard
├── features/
│   ├── admissions/
│   │   └── AdmissionsForm.tsx   # AO dynamic builder and parent application panels
│   ├── attendance/
│   │   └── AttendanceTracker.tsx # Daily attendance lists and notifications
│   ├── auth/
│   │   └── LoginPage.tsx        # Login panel and credentials
│   ├── exams/
│   │   └── ReportGenerator.tsx  # CBSE report card marks entry
│   ├── reports/
│   │   └── AdminDashboard.tsx   # Principal metrics dashboard counters
│   └── timetable/
│       ├── SubstitutionGrid.tsx # Timetable schedule and substitutions component
│       └── Timetable.css        # The high-contrast, responsive CSS stylesheet
├── App.tsx                   # Route navigation mapping
└── main.tsx                  # React DOM render mount
```

---

## 🛠️ Key Components & State Management

### 1. Global API Fetch Wrapper
The [apiFetch() Client](file:///d:/genesiserp/frontend/src/api/client.ts) handles backend communication.
*   **Token Injection**: It intercepts requests, retrieves the JWT token from `localStorage`, and appends it as a `Bearer` token inside the `Authorization` header.
*   **Development Routing**: In development, it targets relative URL paths (`""` base), which triggers the Vite server proxy (`http://localhost:5173/api -> http://localhost:8787/api`). In production, it targets the remote Cloudflare Worker URL.
*   **Error Parsing**: Automatically extracts and throws error messages returned from Hono JSON payloads.

### 2. Main Frame Layout (`Dashboard.tsx`)
The application wraps all content inside Ant Design's `ProLayout` component. It builds:
*   A unified, professional header bar with the school title and logo.
*   A left-hand navigation sidebar mapping to active route views.
*   A top-right user avatar dropdown reflecting the currently logged-in role (`Principal`, `Warden`, or `Teacher`) and offering a one-click logout trigger.

---

## 📱 Mobile Responsiveness

The responsive styling system adapts to varying screen widths:
*   **Breakpoints**: Grid layouts split into multi-column arrangements on desktops, but scale down using `@media (max-width: 992px)` and `@media (max-width: 768px)` media queries.
*   **Responsive Timetable**: On mobile devices, grid selectors, subject form rows, and class cards stack vertically.
*   **Scrollable Data Tables**: Tables are wrapped in a container styling `overflow-x: auto`, ensuring that data grids can be scrolled horizontally on smaller screens without breaking layout structures.
