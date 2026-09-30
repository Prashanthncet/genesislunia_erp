# Hostel & Gate Pass (Modules 5 & 7)

This document provides a detailed functional and technical breakdown of **Module 5 (Hostel Management)** and **Module 7 (Leave / Gate Pass)**.

---

## 🏠 Hostel Management (Module 5)

The Hostel module administers the housing arrangements for boarding students (essential for Sainik residential school models).

### 1. Key Features
*   **House Registry**: Tracks student houses (e.g. Cariappa House, Subroto House), their wardens, and overall capacities.
*   **Room Allocations**: Monitors dorm room capacities and manages student bed assignments (e.g., Room 101 holds 4 beds, mapped to specific students).

### 📂 Key Source Code Reference
*   Backend Controller: [hostel.ts (Backend)](file:///d:/genesiserp/backend/src/routes/hostel.ts#L16-L29)

---

## 🚪 Leave & Gate Pass approvals (Module 7)

The Gate Pass module regulates student departures from campus (leaves, weekend passes, emergency egress) using multi-factor authorization.

### 1. Parent OTP verification flow
To prevent students from creating unauthorized leave requests:
1.  **Request Gatepass**: When a leave request is created, the system generates a random 6-digit verification code (`parent_otp`).
2.  **Dispatch Code**: The system sends this OTP to the parent's email address on file using the Cloudflare Email Worker.
3.  **Parent Signature**: The parent enters the 6-digit OTP into the application, which triggers the `/api/hostels/gatepass/:id/verify-otp` endpoint to verify the code and update the pass state to `otp_verified = 1`.
4.  **Warden Verification**: Wardens cannot approve a pass unless the parent's OTP signature has been verified first.

### 2. Tiered Approval Workflows
The approval route `POST /api/hostels/gatepass/:id/approve` enforces strict security hierarchies based on the type of leave:

*   **Regular Leave (e.g., Weekend visits)**:
    *   *Path*: Warden reviews and executes a single sign-off.
    *   *State Transition*: `Pending` -> `Active` (Pass generated).
*   **Emergency Leave (e.g., Medical checks, Family emergencies)**:
    *   *Path*: Multi-tiered check. The Warden reviews and executes the first sign-off, which escalates the pass. The Principal must then review and execute the final sign-off.
    *   *State Transition*: `Pending` -> `Approved_Warden` -> `Active` (Pass generated).

### 📂 Key Source Code Reference
*   Backend Controller: [hostel.ts (Backend)](file:///d:/genesiserp/backend/src/routes/hostel.ts#L30-L117)
