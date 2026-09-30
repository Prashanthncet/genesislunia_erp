# Finance, Payroll & Communication (Modules 8, 9 & 10)

This document provides a detailed functional and technical breakdown of **Module 8 (Fees & Finance)**, **Module 9 (Parent Communication)**, and **Module 10 (Payroll)**.

---

## 💰 Fees & Payment Collections (Module 8)

The Finance module handles student billing and cash collection. Because government boarding schools often collect fees offline, the module is optimized for manual collection tracking.

### 1. Invoices & Billing
*   **Billing structure**: Fees are defined in `fee_structures` based on class grades and types (e.g. `Tuition Fee: ₹25,000`, `Hostel Fee: ₹15,000`).
*   **Invoice creation**: Invoices (`fee_invoices`) are generated per term. They start with a status of `Unpaid`.

### 2. Offline Payments Ledger
*   **Endpoint**: `POST /api/finance/payments/offline`
*   **Description**: The cashier records physical collections (Cash, Cheque, NEFT/RTGS, DD) along with payment reference numbers and dates.
*   **Payment processing**: 
    1.  The payment is saved to `offline_payments`.
    2.  The backend calculates the cumulative amount paid for the invoice:
        `SELECT SUM(amount_paid) FROM offline_payments WHERE invoice_id = ?`
    3.  If the total paid equals or exceeds the invoice amount, the invoice status is updated to `Paid`. If less, it is marked as `Partial`.

### 📂 Key Source Code Reference
*   Backend Controller: [finance.ts (Backend)](file:///d:/genesiserp/backend/src/routes/finance.ts#L14-L60)
*   Frontend Component: [FeeLedger.tsx (Frontend)](file:///d:/genesiserp/frontend/src/features/finance/FeeLedger.tsx)

---

## 📧 Parent Communication (Module 9)

The Communication module handles school announcements, parent notifications, and automated alerts.

### 1. Cloudflare Email Worker Integration
*   The system uses the `SEND_EMAIL` binding native to Cloudflare Email Workers, configured to send from `erp@stepvista.in` (pre-verified domain).
*   No external SMTP servers or API keys are required.

### 2. Broadcast Announcements
*   **Endpoint**: `POST /api/communication/broadcast`
*   **Description**: Admins or the Principal can broadcast school-wide announcements.
*   **Targeting**: Announcements can be broadcast to the entire branch or filtered for parents of specific classes (e.g., Class 10 A parents only).

### 📂 Key Source Code Reference
*   Backend Controller: [communication.ts (Backend)](file:///d:/genesiserp/backend/src/routes/communication.ts)

---

## 💵 Staff Payroll (Module 10)

The Payroll module handles monthly staff salary calculations and generates payslips.

### 1. Salary Calculations
*   **Gross Salary**: Calculated as:
    $$\text{Gross Salary} = \text{Basic Salary} + \text{HRA} + \text{DA}$$
*   **Deductions**: Calculated based on the staff member's salary structure:
    *   **TDS (Tax)**: Calculated as a percentage of Gross Salary:
        $$\text{TDS Deduction} = \frac{\text{Gross Salary} \times \text{TDS \%}}{100}$$
    *   **EPF (Pension)**: Calculated as a percentage of Basic Salary:
        $$\text{EPF Deduction} = \frac{\text{Basic Salary} \times \text{EPF \%}}{100}$$
*   **Net Salary**: Calculated as:
    $$\text{Net Salary} = \text{Gross Salary} - \text{TDS Deduction} - \text{EPF Deduction}$$

### 2. Admin Overrides
*   **Endpoint**: `POST /api/finance/payroll/generate`
*   *Payload overrides*: The payload accepts optional `tds_override` or `epf_override` numerical values.
*   If overrides are provided (e.g. for special tax exemptions), the system bypasses default percentage rules, using the override values to calculate Net Salary.

### 📂 Key Source Code Reference
*   Backend Controller: [finance.ts (Backend)](file:///d:/genesiserp/backend/src/routes/finance.ts#L62-L96)
