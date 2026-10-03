"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";

type Incident = {
  id: string; incidentDate: string; description: string; actionTaken: string | null; demerits: number; status: string;
  student: { id: string; fullName: string; admissionNo: string; class?: { name: string; section: string | null } };
  reporter?: { id: string; name: string } | null;
};
type AuditEntry = { id: string; actorId: string; action: string; entity: string; entityId: string | null; detail: string | null; createdAt: string };
type ClassItem = { id: string; name: string; section: string | null };
type Student = { id: string; fullName: string; admissionNo: string; classId?: string };

export default function DisciplinePage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  // create form
  const [students, setStudents] = useState<Student[]>([]);
  const [iStudent, setIStudent] = useState("");
  const [iDate, setIDate] = useState(new Date().toISOString().split("T")[0]);
  const [iDesc, setIDesc] = useState("");
  const [iAction, setIAction] = useState("");
  const [iDemerits, setIDemerits] = useState("0");
  const [iConf, setIConf] = useState("");

  const canAudit = role === "super_admin" || role === "branch_admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<Incident[]>("/api/discipline/incidents");
      setIncidents(list ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRole(localStorage.getItem("role") ?? "");
    apiFetch<{ data: Student[] }>("/api/students?page_size=200")
      .then((res) => setStudents(res.data ?? []))
      .catch(() => undefined);
    load();
  }, [load]);

  const loadAudit = async () => {
    try {
      const list = await apiFetch<AuditEntry[]>("/api/discipline/audit-log");
      setAudit(list ?? []);
      setShowAudit(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Audit log requires admin role");
    }
  };

  const create = async () => {
    if (!iStudent || !iDesc) return setMessage("Student and description are required");
    setLoading(true);
    try {
      await apiFetch("/api/discipline/incidents", {
        method: "POST",
        body: JSON.stringify({
          student_id: iStudent, incident_date: iDate, description: iDesc,
          action_taken: iAction || undefined, demerits: Number(iDemerits) || 0, confidential_notes: iConf || undefined,
        }),
      });
      setIDesc(""); setIAction(""); setIDemerits("0"); setIConf("");
      await load();
      setMessage("Incident reported ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/discipline/incidents/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const remove = async (id: string) => {
    try { await apiFetch(`/api/discipline/incidents/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const statusTone = (s: string): "emerald" | "amber" | "rose" =>
    s === "Closed" ? "emerald" : s === "Under Review" ? "amber" : "rose";

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="discipline"
          title="Discipline & Safeguarding"
          subtitle="Incident log with confidential notes and full audit trail."
          actions={canAudit && (
            <Button variant="soft" onClick={loadAudit}>
              <Icon name="reports" className="h-4 w-4" /> View Audit Log
            </Button>
          )}
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Total Incidents" value={incidents.length} tone="rose" icon="discipline" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Open" value={incidents.filter((i) => i.status === "Open").length} tone="rose" icon="alert" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Under Review" value={incidents.filter((i) => i.status === "Under Review").length} tone="amber" icon="spark" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Total Demerits" value={incidents.reduce((s, i) => s + (i.demerits ?? 0), 0)} tone="violet" icon="exams" />
        </Reveal>
      </div>

      {/* Report incident */}
      <Reveal delay={60}>
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <Icon name="alert" className="h-4 w-4 text-rose-500" /> Report Incident
        </h3>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <select value={iStudent} aria-label="Student" onChange={(e) => setIStudent(e.target.value)} className="field">
            <option value="">Select student…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
          </select>
          <input value={iDate} onChange={(e) => setIDate(e.target.value)} type="date" className="field" />
          <input value={iDesc} onChange={(e) => setIDesc(e.target.value)} placeholder="Description *" className="field sm:col-span-2" />
          <input value={iAction} onChange={(e) => setIAction(e.target.value)} placeholder="Action taken" className="field" />
          <div className="flex gap-2">
            <input value={iDemerits} onChange={(e) => setIDemerits(e.target.value)} type="number" placeholder="Demerits" className="field w-28 shrink-0" />
            <input value={iConf} onChange={(e) => setIConf(e.target.value)} placeholder="Confidential notes (restricted)" className="field flex-1" />
          </div>
        </div>
        <Button variant="primary" onClick={create} loading={loading} className="mt-3">
          <Icon name="check" className="h-4 w-4" /> Submit Incident
        </Button>
      </div>
      </Reveal>

      {/* Incident list */}
      <Reveal delay={100}>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Demerits</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} className="row-hover border-t border-slate-100">
                <td className="px-4 py-3 text-xs">{i.incidentDate?.slice(0, 10)}</td>
                <td className="px-4 py-3 font-semibold">{i.student?.fullName}</td>
                <td className="max-w-xs px-4 py-3"><span className="line-clamp-2">{i.description}</span></td>
                <td className="px-4 py-3 tnum">{i.demerits}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                    <select
                      aria-label={`Change status for ${i.student?.fullName ?? "incident"}`}
                      value={i.status}
                      onChange={(e) => setStatus(i.id, e.target.value)}
                      className="field w-auto !px-2 !py-1 text-xs"
                    >
                      {["Open", "Under Review", "Closed"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {role === "super_admin" || role === "branch_admin" ? (
                    <button onClick={() => remove(i.id)} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {incidents.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No incidents logged."}</td></tr>}
          </tbody>
        </table>
      </div>
      </Reveal>

      {/* Audit modal */}
      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowAudit(false)}>
          <div className="card max-h-[80vh] w-full max-w-2xl overflow-y-auto p-6" style={{ animation: "scale-in 0.3s var(--ease-spring) both" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Safeguarding Audit Log</h3>
              <button onClick={() => setShowAudit(false)} className="btn-soft !px-3 !py-1 text-xs" aria-label="Close audit log">
                <Icon name="x" className="h-3.5 w-3.5" /> Close
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl bg-slate-50/70 px-3 py-2 transition-colors duration-200">
                  <Badge tone={a.action === "VIEW" ? "sky" : a.action === "DELETE" ? "rose" : "emerald"}>{a.action}</Badge>
                  <span className="font-mono text-xs">{a.entity}{a.entityId ? `#${a.entityId.slice(0, 8)}` : ""}</span>
                  {a.detail && <span className="text-xs text-slate-500">{a.detail}</span>}
                  <span className="ml-auto text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
              {audit.length === 0 && <li className="py-4 text-center text-slate-400">No audit entries.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
