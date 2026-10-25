# Genesis ERP — Demo Guide
### For Internal Use: Marketing & Sales Team

---

## 🚀 Accessing the Live Demo

The ERP platform is hosted entirely on Cloudflare's edge network for the demo. No local servers are required.

**Live Application URL:**
**👉 [https://genesiserp-frontend.pages.dev](https://genesiserp-frontend.pages.dev)**

*(The backend API is running globally at `https://backend.shishira-932.workers.dev`)*

---

## 🔐 Login Credentials

Three demo accounts are pre-loaded. Each shows a different view of the system.

| Role | Email | Password | Access Level |
|------|-------|----------|--------------|
| **Principal / Admin** | `principal@sainik01.edu` | `Demo@Principal1` | Full access to all modules |
| **Hostel Warden** | `vikram.rathore@sainik01.edu` | `Demo@Warden1` | Hostel, Gate Pass, Discipline |
| **Teacher** | `anil.sharma@sainik01.edu` | `Demo@Teacher1` | Attendance, Timetable, Academics |

> 💡 **Start with the Principal account** — it shows the most complete picture of the system.

---

## 🗺️ Module-by-Module Demo Walkthrough

Work through these in order. Each section highlights what to click and what data will appear.

---

### Module 1 & 2 — Admissions & Student Information

1. Log in as **Principal**.
2. Navigate to **Students** in the sidebar.
3. You will see 4 pre-loaded students:

| Name | Admission No | Class | Blood Group |
|------|-------------|-------|-------------|
| Arjun Kumar | SNK-2024-001 | Class 10 A | O+ |
| Rohan Singh | SNK-2024-002 | Class 10 A | B+ |
| Neha Patel | SNK-2024-003 | Class 10 B | A- |
| Rahul Sharma | SNK-2023-045 | Class 12 Science | AB+ |

4. Click any student to see their **360-degree profile**: personal details, parent info, physical metrics (height, weight, vision), and document vault.
5. To demo admissions, click **Add New Student** and fill in the form.

**Key talking point:** *"All student data — health, family, academics — in one profile. No more paper registers."*

---

### Module 3 — Academics (Syllabus & Assignments)

1. Navigate to **Academics**.
2. Select **Class 10 A**.
3. You will see:
   - **Syllabus:** "Term 1 Mathematics — Algebra, Geometry, Trigonometry"
   - **Lesson Plans:** "Introduction to Quadratic Equations" (marked Completed on July 16)
   - **Assignment:** "Quadratic Equations Exercise 1" — due July 20

**Key talking point:** *"Teachers plan, track, and assign work from one place. No WhatsApp groups, no paper."*

---

### Module 4 — Attendance (Biometric + Manual)

1. Navigate to **Attendance**.
2. Select **Class 10 A** and today's date.
3. You will see Arjun Kumar marked **Present** (auto-logged via biometric CAMS at morning entry).
4. Rohan Singh is marked **Absent** from yesterday.
5. To demo manual marking: change the date to yesterday, mark students Present/Absent and click Save.

**Key talking point:** *"The CAMS biometric machine logs punches directly into the system. If a student forgets to punch, a teacher can manually correct it."*

---

### Module 5 & 7 — Hostel + Gate Pass

1. Navigate to **Hostel**.
2. You will see two houses:
   - **Cariappa House** — Warden: Capt. Vikram Rathore (Capacity: 100)
   - **Subroto House** — Unassigned Warden (Capacity: 100)
3. Room 101 in Cariappa: Arjun Kumar and Rohan Singh allocated.
4. Navigate to **Gate Passes**.
5. Two live passes are visible:

| Student | Type | Reason | Status |
|---------|------|--------|--------|
| Arjun Kumar | Regular | Weekend leave for family function | **Pending** |
| Rahul Sharma | Emergency | Medical checkup — Military Hospital | **Active** |

6. Demo the approval flow: Click on Arjun's pass → **Verify OTP** → **Approve as Warden**.

**Key talking point:** *"Every student who leaves campus has a digital trail — parent consent via OTP, warden approval, principal sign-off for emergencies. No child leaves without accountability."*

---

### Module 6 — Timetable

1. Navigate to **Timetable**.
2. Select **Class 10 A** and **Monday**.
3. Three periods are pre-loaded:
   - Period 1: Mathematics — Anil Sharma
   - Period 2: Science — Anil Sharma
   - Period 3: English — Priya Desai
4. Demo substitution: Click **Request Substitution** for Period 2 — the system automatically suggests available teachers who have no conflicting periods at that time.

---

### Module 8 — Fees & Finance

1. Navigate to **Fee Ledger**.
2. Two invoices for Term 1 2026 are visible:

| Student | Total Due | Paid | Status |
|---------|-----------|------|--------|
| Arjun Kumar | ₹40,000 | ₹20,000 | Partial |
| Rohan Singh | ₹40,000 | ₹0 | Unpaid |

3. Click **Collect Payment** on Rohan Singh's row.
4. Enter amount, select mode (Cash / Cheque / NEFT/RTGS / DD), add reference number.
5. Click **Record Payment** — status updates to Paid or Partial.

**Key talking point:** *"The school operates on offline payments only — cash, cheque, NEFT. This is built exactly for that. Every payment is recorded with who collected it and when."*

---

### Module 9 — Parent Communication

1. Navigate to **Communication**.
2. Click **New Broadcast**.
3. Select **All Classes** or a specific class.
4. Write a subject and message (e.g., "Annual Sports Day — July 25").
5. Click **Send** — emails are dispatched to all parent email addresses on file.

**Key talking point:** *"No more relying on WhatsApp forwards. The school sends official, tracked communications directly to parents from one dashboard."*

---

### Module 10 — Payroll

1. Navigate to **Payroll**.
2. Select **Anil Sharma (Teacher)** and **June 2026**.
3. A generated payslip appears:

| Component | Amount |
|-----------|--------|
| Basic Salary | ₹40,000 |
| HRA | ₹10,000 |
| DA | ₹5,000 |
| **Gross** | **₹55,000** |
| TDS (10%) | −₹5,500 |
| EPF (12%) | −₹4,800 |
| **Net Pay** | **₹44,700** |

4. Show the override: Change TDS % to 5% (for a special territory exemption) → regenerate → Net Pay updates live.

**Key talking point:** *"TDS and EPF rates are configurable per staff member and per territory. The accounts team doesn't need Excel — just adjust the rate and regenerate."*

---

### Module 11 — Discipline & Safeguarding

1. Navigate to **Discipline**.
2. One incident is logged:
   - **Rohan Singh** — *Found using mobile phone in dormitory after lights out.*
   - Action: Phone confiscated for 1 week. Extra PT assigned.
   - Demerits: 3 points
   - Reported by: Capt. Vikram Rathore

3. Click **Report Incident** to demo a new entry.

**Key talking point:** *"Every disciplinary action is logged, timestamped, and attached to the student's record. Full safeguarding audit trail for government compliance."*

---

### Module 12 — Staff Management

1. Navigate to **Staff**.
2. Four staff members are pre-loaded.
3. Navigate to **Leave Requests**:
   - **Priya Desai** has a Casual Leave request for July 20–21 (Attending a wedding) — **Pending**.
4. Click **Approve** or **Reject** as Principal.

---

### Module 13 — Admin Dashboard

1. Navigate to **Dashboard**.
2. Live stats show:
   - Today's Attendance Rate: 94.5%
   - 42 students absent
   - ₹45,000 fee collection today
   - 3 active gate passes
   - 5 pending leave approvals
3. **Pending Approvals** list shows gate passes that need sign-off.

**Key talking point:** *"The Principal used to get a 5 PM email summary from a cron job. Now it's live, all day, on any device."*

---

## ✅ Quick Demo Checklist

Use this to confirm everything works before going live:

- [ ] Both servers start without errors
- [ ] Login works for all 3 accounts
- [ ] Student list loads with 4 students
- [ ] Attendance page shows yesterday's marks
- [ ] Gate passes show 2 records (Pending + Active)
- [ ] Fee ledger shows ₹40,000 invoices
- [ ] Payslip for Anil Sharma shows ₹44,700 net pay
- [ ] Incident log shows Rohan Singh's entry
- [ ] Priya Desai's leave request shows as Pending

---

## ❓ Common Questions & Answers

**Q: Is this CBSE compliant?**
> Yes. The subject master data includes all CBSE subjects for Class 6–12 split by group (Group 1, 2, 3). The exam marks module tracks scores against CBSE's grading system.

**Q: Can multiple Sainik Schools use this?**
> Yes. Every piece of data is scoped to a `branch_id`. You can onboard Pune, Lucknow, and Rewa on the same platform — zero data crossover between campuses.

**Q: Is the student data secure?**
> All API requests require a JWT token. Roles are strictly enforced — a teacher cannot see payroll data. Document storage (Aadhar cards, medical forms) is in isolated Cloudflare R2 buckets per campus.

**Q: What about the biometric machines already installed?**
> We integrate directly with CAMS biometric machines via a webhook. When a student punches in at the gate, the ERP marks them Present in under a second — automatically.

**Q: Can it work offline?**
> The frontend caches data for viewing. All writes (attendance, payments) require an internet connection. Cloudflare's global edge ensures the lowest possible latency from anywhere in India.

---

*Genesis ERP — Built by StepVista Technologies*
*Contact: admin@stepvista.in*
