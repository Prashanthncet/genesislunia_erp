"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";

type StaffLeave = { id: string; leaveType: string; startDate: string; endDate: string; reason: string | null; status: string; staff: { id: string; name: string } };
type StudentLeave = { id: string; leaveType: string; startDate: string; endDate: string; reason: string | null; status: string; student: { id: string; fullName: string } };
type GatePass = { id: string; type: string; reason: string; outTime: string; expectedInTime: string | null; status: string; student: { id: string; fullName: string; admissionNo: string } };
type StaffMember = { id: string; name: string; role: string };
type Balance = { staff_id: string; name: string; role: string; leaves: Record<string, { used: number; quota: number; remaining: number }> };
type Student = { id: string; fullName: string; admissionNo: string };

type Tab = "staff" | "student" | "gate";

export default function LeavesPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [staffLeaves, setStaffLeaves] = useState<StaffLeave[]>([]);
  const [studentLeaves, setStudentLeaves] = useState<StudentLeave[]>([]);
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid|expired/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);
  const [loading, setLoading] = useState(false);

  // staff leave form
  const [slStaff, setSlStaff] = useState("");
  const [slType, setSlType] = useState("Casual");
  const [slFrom, setSlFrom] = useState("");
  const [slTo, setSlTo] = useState("");
  const [slReason, setSlReason] = useState("");

  // student leave form
  const [stStudent, setStStudent] = useState("");
  const [stType, setStType] = useState("Sick");
  const [stFrom, setStFrom] = useState("");
  const [stTo, setStTo] = useState("");
  const [stReason, setStReason] = useState("");

  // gate pass form
  const [gpStudent, setGpStudent] = useState("");
  const [gpType, setGpType] = useState("Home Visit");
  const [gpReason, setGpReason] = useState("");
  const [gpOut, setGpOut] = useState("");
  const [gpIn, setGpIn] = useState("");

  // OTP check-in
  const [otpPass, setOtpPass] = useState("");
  const [otp, setOtp] = useState("");

  useEffect(() => { setRole(localStorage.getItem("role") ?? ""); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sl, stl, gp, bal] = await Promise.all([
        apiFetch<StaffLeave[]>("/api/staff-leaves"),
        apiFetch<StudentLeave[]>("/api/student-leaves"),
        apiFetch<GatePass[]>("/api/gate-passes"),
        apiFetch<Balance[]>("/api/balances"),
      ]);
      setStaffLeaves(sl ?? []);
      setStudentLeaves(stl ?? []);
      setGatePasses(gp ?? []);
      setBalances(bal ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch<StaffMember[]>("/api/staff")
      .then(setStaffList)
      .catch(() => undefined);
    apiFetch<{ data: Student[] }>("/api/students?page_size=200")
      .then((res) => setStudents(res.data ?? []))
      .catch(() => undefined);
  }, []);

  const applyStaffLeave = async () => {
    if (!slStaff || !slFrom || !slTo) return setMessage("Staff, dates are required");
    setLoading(true);
    try {
      await apiFetch("/api/staff-leaves", { method: "POST", body: JSON.stringify({ staff_id: slStaff, leave_type: slType, start_date: slFrom, end_date: slTo, reason: slReason || undefined }) });
      setSlFrom(""); setSlTo(""); setSlReason("");
      await load();
      setMessage("Leave request submitted ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const applyStudentLeave = async () => {
    if (!stStudent || !stFrom || !stTo) return setMessage("Student and dates are required");
    setLoading(true);
    try {
      await apiFetch("/api/student-leaves", { method: "POST", body: JSON.stringify({ student_id: stStudent, leave_type: stType, start_date: stFrom, end_date: stTo, reason: stReason || undefined }) });
      setStFrom(""); setStTo(""); setStReason("");
      await load();
      setMessage("Leave request submitted ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const decide = async (kind: "staff" | "student", id: string, decision: "Approved" | "Rejected") => {
    try {
      await apiFetch(`/api/${kind === "staff" ? "staff" : "student"}-leaves/${id}/decision`, { method: "PUT", body: JSON.stringify({ decision }) });
      await load();
      setMessage(`Leave ${decision.toLowerCase()} ✓`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const createGatePass = async () => {
    if (!gpStudent || !gpReason || !gpOut) return setMessage("Student, reason and out time are required");
    setLoading(true);
    try {
      await apiFetch("/api/gate-passes", { method: "POST", body: JSON.stringify({ student_id: gpStudent, type: gpType, reason: gpReason, out_time: gpOut, expected_in_time: gpIn || undefined }) });
      setGpStudent(""); setGpReason(""); setGpOut(""); setGpIn("");
      await load();
      setMessage("Gate pass issued — parent notified ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const gateAction = async (id: string, action: string) => {
    setLoading(true);
    try {
      const body = action === "checkin" ? JSON.stringify({ otp }) : undefined;
      await apiFetch(`/api/gate-passes/${id}/${action}`, { method: "PUT", body });
      setOtp(""); setOtpPass("");
      await load();
      setMessage("Gate pass updated ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const badge = (s: string): "emerald" | "sky" | "rose" | "amber" => {
    if (s === "Approved" || s === "Returned") return "emerald";
    if (s.startsWith("Warden") || s === "Checked Out") return "sky";
    if (s === "Rejected") return "rose";
    return "amber";
  };

  const canDecideLeave = ["super_admin", "branch_admin", "principal"].includes(role);

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="leaves"
          title="Leaves & Gate Passes"
          subtitle="Staff/student leave requests and the parent-OTP gate pass workflow."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Staff Leaves" value={staffLeaves.length} tone="brand" icon="leaves" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Pending" value={[...staffLeaves, ...studentLeaves].filter((l) => l.status === "Pending").length} tone="amber" icon="alert" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Student Leaves" value={studentLeaves.length} tone="violet" icon="students" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Gate Passes" value={gatePasses.length} tone="teal" icon="discipline" />
        </Reveal>
      </div>

      <Reveal delay={60} className="flex flex-wrap gap-2">
        {(["staff", "student", "gate"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative overflow-hidden rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              tab === t ? "text-white shadow-lift" : "border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700"
            }`}>
            {tab === t && <span className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-800" />}
            <span className="relative">{t === "staff" ? "Staff Leaves" : t === "student" ? "Student Leaves" : "Gate Passes"}</span>
          </button>
        ))}
      </Reveal>

      {tab === "staff" && (
        <div key="staff" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="leaves" className="h-4 w-4 text-brand-600" /> Apply Leave
            </h3>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <select value={slStaff} aria-label="Staff" onChange={(e) => setSlStaff(e.target.value)} className="field">
                <option value="">Select staff…</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={slType} aria-label="Leave type" onChange={(e) => setSlType(e.target.value)} className="field">
                {["Casual", "Sick", "Earned", "Duty", "Unpaid"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={slFrom} onChange={(e) => setSlFrom(e.target.value)} type="date" className="field" />
              <input value={slTo} onChange={(e) => setSlTo(e.target.value)} type="date" className="field" />
              <input value={slReason} onChange={(e) => setSlReason(e.target.value)} placeholder="Reason" className="field sm:col-span-2" />
            </div>
            <Button variant="primary" onClick={applyStaffLeave} loading={loading} className="mt-3">
              <Icon name="check" className="h-4 w-4" /> Submit
            </Button>
          </div>
          <ul className="space-y-2">
            {staffLeaves.map((l) => (
              <li key={l.id} className="card card-hover flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{l.staff?.name}</span>
                <Badge tone="slate">{l.leaveType}</Badge>
                <span className="text-slate-500">{l.startDate} → {l.endDate}</span>
                <span className="ml-auto"><Badge tone={badge(l.status)}>{l.status}</Badge></span>
                {l.status === "Pending" && canDecideLeave && (
                  <span className="flex gap-2">
                    <button onClick={() => decide("staff", l.id, "Approved")} className="btn-soft !px-2.5 !py-1 text-xs">Approve</button>
                    <button onClick={() => decide("staff", l.id, "Rejected")} className="btn-danger !px-2.5 !py-1 text-xs">Reject</button>
                  </span>
                )}
              </li>
            ))}
            {staffLeaves.length === 0 && <li className="card py-8 text-center text-slate-400">No staff leave requests.</li>}
          </ul>

          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="reports" className="h-4 w-4 text-brand-600" /> Leave Balances ({new Date().getFullYear()})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="table-head">
                  <tr><th className="py-2 pr-3">Staff</th><th className="py-2 pr-3">Casual</th><th className="py-2 pr-3">Sick</th><th className="py-2 pr-3">Earned</th><th className="py-2 pr-3">Duty</th></tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.staff_id} className="row-hover border-t border-slate-100">
                      <td className="py-2 pr-3 font-semibold">{b.name}</td>
                      {["Casual", "Sick", "Earned", "Duty"].map((t) => (
                        <td key={t} className="py-2 pr-3 tnum">{b.leaves[t]?.remaining ?? 0}<span className="text-slate-400">/{b.leaves[t]?.quota ?? 0}</span></td>
                      ))}
                    </tr>
                  ))}
                  {balances.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">No active staff.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "student" && (
        <div key="student" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="students" className="h-4 w-4 text-violet-500" /> Apply Leave
            </h3>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <select value={stStudent} aria-label="Student" onChange={(e) => setStStudent(e.target.value)} className="field">
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
              </select>
              <select value={stType} aria-label="Leave type" onChange={(e) => setStType(e.target.value)} className="field">
                {["Sick", "Home Visit", "Competition", "Other"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={stFrom} onChange={(e) => setStFrom(e.target.value)} type="date" className="field" />
              <input value={stTo} onChange={(e) => setStTo(e.target.value)} type="date" className="field" />
              <input value={stReason} onChange={(e) => setStReason(e.target.value)} placeholder="Reason" className="field sm:col-span-2" />
            </div>
            <Button variant="primary" onClick={applyStudentLeave} loading={loading} className="mt-3">
              <Icon name="check" className="h-4 w-4" /> Submit
            </Button>
          </div>
          <ul className="space-y-2">
            {studentLeaves.map((l) => (
              <li key={l.id} className="card card-hover flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{l.student?.fullName}</span>
                <Badge tone="slate">{l.leaveType}</Badge>
                <span className="text-slate-500">{l.startDate} → {l.endDate}</span>
                <span className="ml-auto"><Badge tone={badge(l.status)}>{l.status}</Badge></span>
                {l.status === "Pending" && (
                  <span className="flex gap-2">
                    <button onClick={() => decide("student", l.id, "Approved")} className="btn-soft !px-2.5 !py-1 text-xs">Approve</button>
                    <button onClick={() => decide("student", l.id, "Rejected")} className="btn-danger !px-2.5 !py-1 text-xs">Reject</button>
                  </span>
                )}
              </li>
            ))}
            {studentLeaves.length === 0 && <li className="card py-8 text-center text-slate-400">No student leave requests.</li>}
          </ul>
        </div>
      )}

      {tab === "gate" && (
        <div key="gate" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="discipline" className="h-4 w-4 text-teal-500" /> Issue Gate Pass
            </h3>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <select value={gpStudent} aria-label="Student" onChange={(e) => setGpStudent(e.target.value)} className="field">
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
              </select>
              <select value={gpType} aria-label="Pass type" onChange={(e) => setGpType(e.target.value)} className="field">
                {["Home Visit", "Medical", "Competition", "Other"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={gpReason} onChange={(e) => setGpReason(e.target.value)} placeholder="Reason *" className="field" />
              <input value={gpOut} onChange={(e) => setGpOut(e.target.value)} type="datetime-local" className="field" />
              <input value={gpIn} onChange={(e) => setGpIn(e.target.value)} type="datetime-local" className="field" />
            </div>
            <Button variant="primary" onClick={createGatePass} loading={loading} className="mt-3">
              <Icon name="check" className="h-4 w-4" /> Issue Pass
            </Button>
          </div>

          {/* OTP check-in box */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-4"
            style={{ animation: "pulse-ring 2.4s var(--ease-out-soft) infinite" }}>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-sky-900">
              <Icon name="discipline" className="h-4 w-4" /> Parent OTP check-in:
            </span>
            <select value={otpPass} aria-label="Checked-out pass" onChange={(e) => setOtpPass(e.target.value)} className="field w-auto">
              <option value="">Select checked-out pass…</option>
              {gatePasses.filter((g) => g.status === "Checked Out").map((g) => (
                <option key={g.id} value={g.id}>{g.student.fullName} — out {g.outTime?.slice(11, 16)}</option>
              ))}
            </select>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit OTP" maxLength={6}
              inputMode="numeric" className="field w-32 tnum" />
            <Button variant="primary" onClick={() => otpPass && gateAction(otpPass, "checkin")} disabled={!otpPass || !otp}>
              <Icon name="check" className="h-4 w-4" /> Verify & Check In
            </Button>
          </div>

          <ul className="space-y-2">
            {gatePasses.map((g) => (
              <li key={g.id} className="card card-hover flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{g.student?.fullName}</span>
                <Badge tone="slate">{g.type}</Badge>
                <span className="text-slate-500">{g.reason}</span>
                <span className="text-xs text-slate-400">out {g.outTime?.slice(0, 16).replace("T", " ")}</span>
                <span className="ml-auto"><Badge tone={badge(g.status)}>{g.status}</Badge></span>
                <span className="flex gap-2">
                  {g.status === "Pending" && ["super_admin", "branch_admin", "warden"].includes(role) && (
                    <button onClick={() => gateAction(g.id, "approve-warden")} className="btn-soft !px-2.5 !py-1 text-xs">Warden ✓</button>
                  )}
                  {g.status === "Warden Approved" && ["super_admin", "branch_admin", "principal"].includes(role) && (
                    <button onClick={() => gateAction(g.id, "approve-principal")} className="btn-soft !px-2.5 !py-1 text-xs">Principal ✓</button>
                  )}
                  {g.status === "Approved" && ["super_admin", "branch_admin", "warden"].includes(role) && (
                    <button onClick={() => gateAction(g.id, "checkout")} className="btn-soft !px-2.5 !py-1 text-xs">Check Out</button>
                  )}
                </span>
              </li>
            ))}
            {gatePasses.length === 0 && <li className="card py-8 text-center text-slate-400">No gate passes.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
