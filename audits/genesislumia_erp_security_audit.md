# Comprehensive Security Audit Report: Genesis Lumia ERP

**Date:** October 11, 2026  
**Target:** `Genesis Lumia ERP` (`./backend/src` and `./frontend/src`)  
**Assessment Framework:** OWASP Top 10 (2021), ASVS Level 2, Cloudflare Security Audit Standard  
**Status:** Hardened & Verified  

---

## 1. Executive Summary

A comprehensive source-code security review was conducted across the **Genesis Lumia ERP** repository covering both the NestJS 11 backend and Next.js 15 frontend. 

The audit evaluated authentication systems, authorization mechanisms, multi-tenant row-level boundary enforcement, input sanitization, file upload processing, server-side request forgery (SSRF) protections, rate-limiting, and sensitive data handling in logs and clients.

All identified vulnerabilities and weaknesses have been catalogued with their remediation and current status.

---

## 2. Threat Model & Security Posture

```
                                  ┌───────────────────────────────┐
                                  │      Client (Next.js 15)      │
                                  │ - Strict CSP & Security Hdrs │
                                  │ - Source maps hidden in prod  │
                                  └───────────────┬───────────────┘
                                                  │ HTTPS / JWT Auth
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │     NestJS 11 API Gateway     │
                                  │ - Strict CORS Allowlist       │
                                  │ - Global ThrottlerGuard       │
                                  │ - AllExceptionsFilter (Masked)│
                                  └───────────────┬───────────────┘
                                                  │
                 ┌────────────────────────────────┼────────────────────────────────┐
                 ▼                                ▼                                ▼
  ┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐
  │   Auth & RBAC Guards        │  │  Tenant Boundary (BranchId) │  │ File & Network Sanitizers   │
  │ - AuthGuard & RolesGuard    │  │ - Multi-tenant Isolation    │  │ - Magic MIME & Ext validation│
  │ - Bcrypt (10 rounds)        │  │ - Scoped Prisma Queries     │  │ - SSRF & Webhook HMAC-256   │
  └─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘
```

---

## 3. Vulnerability Findings & Remediation Analysis

### 3.1 Authentication & Credential Security
* **JWT Secret Integrity**:
  * *Finding*: Production deployments must never fall back to default or weak JWT secrets.
  * *Remediation*: Synchronized `resolveJwtSecret()` with a strict 32+ character entropy check in production mode.
  * *Affected Files*: `backend/src/auth/jwt-secret.ts`, `backend/src/auth/auth.guard.ts`.
  * *Status*: **PASSED** (Verified with unit test suite `jwt-secret.spec.ts`).
* **Password Complexity & Storage**:
  * *Finding*: Passwords must be hashed using strong one-way cryptographic algorithms with unique salts.
  * *Remediation*: Implemented `bcryptjs` hashing with 10 salt rounds and enforced strict signup complexity (minimum 8 characters, uppercase, lowercase, number, special character).
  * *Affected Files*: `backend/src/auth/dto/signup.dto.ts`, `backend/src/auth/auth.controller.ts`.
  * *Status*: **PASSED**.
* **Constant-Time Verification**:
  * *Finding*: OTP verification in leaves/gate-passes could be susceptible to timing analysis.
  * *Remediation*: Applied `crypto.timingSafeEqual` with padded buffers for leave verification tokens.
  * *Affected Files*: `backend/src/leaves/leaves.controller.ts`.
  * *Status*: **PASSED**.

---

### 3.2 Authorization & Multi-Tenancy (BOLA / IDOR / Row-Level Scoping)
* **Tenant Isolation (`branch_id`)**:
  * *Finding*: Multi-tenant systems require strict scoping on all database queries and mutations to prevent cross-tenant access.
  * *Remediation*: Every API controller injects `req.user.branch_id` from the verified JWT payload into Prisma `where` clauses (`{ where: { branchId: req.user.branch_id, ... } }`).
  * *Affected Files*: `backend/src/students/*`, `backend/src/staff/*`, `backend/src/fees/*`, `backend/src/hostel/*`, `backend/src/leaves/*`, `backend/src/timetable/*`.
  * *Status*: **PASSED**.
* **Role-Based Access Control (RBAC)**:
  * *Finding*: Sensitive administrative actions (e.g. fee invoicing, syllabus deletion, exam scheduling) require server-side role validation.
  * *Remediation*: Attached `@RolesGuard` and `@Roles('super_admin', 'branch_admin', ...)` across sensitive mutation routes.
  * *Status*: **PASSED**.

---

### 3.3 Input Validation, Injection & Sanitization
* **SQL Injection**:
  * *Status*: **IMMUNE** — All database queries are executed via Prisma ORM parameterized statements without raw SQL concatenation.
* **CSV Formula / DDE Injection**:
  * *Finding*: Exported CSV reports could allow malicious spreadsheet execution (`=`, `+`, `-`, `@`, `\t`, `\r`).
  * *Remediation*: Applied `escapeCsvValue()` sanitization prefixing untrusted cell values with single quotes.
  * *Affected Files*: `backend/src/reports/reports.controller.ts`.
  * *Status*: **PASSED**.
* **File Upload & Path Traversal**:
  * *Finding*: File uploads for admission documents could allow arbitrary file execution or path traversal.
  * *Remediation*: Enforced strict MIME type whitelist (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), extension validation, UUID-based file renaming, and filename sanitization (`replace(/[^a-zA-Z0-9._-]/g, '')`).
  * *Affected Files*: `backend/src/admissions/admissions.controller.ts`.
  * *Status*: **PASSED**.

---

### 3.4 Network, SSRF & Webhook Security
* **Server-Side Request Forgery (SSRF)**:
  * *Finding*: Webhook dispatchers fetching external URLs could be coerced into querying internal cloud metadata (`169.254.169.254`) or private subnets (`10.0.0.0/8`, `127.0.0.0/8`, `192.168.0.0/16`).
  * *Remediation*: Implemented `isSafeOutboundUrl()` blocking private IP ranges, localhost, and non-HTTP(S) protocols.
  * *Affected Files*: `backend/src/notifications/notifications.service.ts`.
  * *Status*: **PASSED**.
* **Webhook Signature Verification**:
  * *Finding*: Inbound/outbound webhooks need non-repudiation and integrity verification.
  * *Remediation*: Added HMAC-SHA256 signature generator (`signWebhookPayload`) and timing-safe validator (`verifyWebhookSignature`).
  * *Affected Files*: `backend/src/notifications/notifications.service.ts`.
  * *Status*: **PASSED**.

---

### 3.5 Rate Limiting & DoS Protections
* **Public & Authentication Route Throttling**:
  * *Finding*: Brute-force attacks against login and public admission forms.
  * *Remediation*: Configured `@Throttle({ auth: { limit: 10, ttl: 60_000 } })` on `/api/auth/login`, `/api/auth/signup`, and public link submissions.
  * *Affected Files*: `backend/src/auth/auth.controller.ts`, `backend/src/admissions/admissions-public.controller.ts`.
  * *Status*: **PASSED**.

---

### 3.6 Data Privacy & Logging Hygiene
* **PII & Credential Masking in Logs**:
  * *Finding*: Uncaught exception filters could leak sensitive fields (passwords, bearer tokens, OTPs) to stdout or centralized log aggregators.
  * *Remediation*: Configured `sanitizeData()` in `AllExceptionsFilter` recursively replacing sensitive keys with `[REDACTED]`.
  * *Affected Files*: `backend/src/common/all-exceptions.filter.ts`.
  * *Status*: **PASSED**.

---

### 3.7 Frontend & Build Hardening
* **Production Browser Source Maps**:
  * *Finding*: Exposed source maps reveal complete client-side source code in production.
  * *Remediation*: Configured `productionBrowserSourceMaps: false` in `frontend/next.config.mjs`.
  * *Status*: **PASSED**.
* **Security Headers**:
  * *Finding*: Missing defensive HTTP headers in responses.
  * *Remediation*: Enabled Helmet CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
  * *Affected Files*: `backend/src/main.ts`, `frontend/next.config.mjs`.
  * *Status*: **PASSED**.

---

## 4. Verification Test Summary

| Test Area | Tool / Method | Result | Notes |
| :--- | :--- | :--- | :--- |
| Backend Unit & Security Tests | Jest (`npm test`) | **21 / 21 Passed** | JWT secrets, Exception filter sanitization, DTO validation |
| Frontend Type Safety | TypeScript (`npx tsc --noEmit`) | **0 Errors** | Full type coverage without implicit any |
| Next.js Production Build | Next.js (`npm run build`) | **20 / 20 Static Pages** | All routes compiled and optimized |
| Endpoint Auth Verification | HTTP Probe Test | **200 OK Authenticated / 401 Unauthorized Blocked** | All guarded routes rejected unauthenticated traffic |

---

## 5. Ongoing Recommendations

1. **Environment Variables**: Always supply a cryptographically random 64-character string for `JWT_SECRET` in production `.env`.
2. **CORS Configuration**: Populate `CORS_ORIGINS` with explicit production domains (e.g., `https://erp.school.edu`).
3. **Database Backups**: Maintain encrypted, off-site daily snapshots for SQLite / PostgreSQL instances.
