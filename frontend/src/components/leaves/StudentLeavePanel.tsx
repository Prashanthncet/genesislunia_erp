"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { hasRole, R, type Me } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, Tabs, useToast } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
import { ReasonModal } from "./ReasonModal";
import { STUDENT_LEAVE_FILE, STUDENT_LEAVE_TYPES, classLabel, errMsg, statusBadge, type StudentLeave, type StudentOption } from "./shared";

/** Student leave: staff file on a student's behalf; approvers decide. Parents use the portal (same endpoints). */
export function StudentLeavePanel({ me, students }: { me: Me; students: StudentOption[] }) {
  const toast = useToast();
  const canFile = hasRole(me, STUDENT_LEAVE_FILE);
  const canDecide = hasRole(me, R.STUDENT_LEAVE_APPROVE);
  const [rows, setRows] = useState<StudentLeave[]>([]);
  const [filter, setFilter] = useState<"Pending" | "all">("Pending");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ leave: StudentLeave; decision: "Approved" | "Rejected" } | null>(null);
  const [form, setForm] = useState({ student_id: "", leave_type: "Medical", start_date: "", end_date: "", reason: "" });

  const load = useCallback(async () => {
    try { setRows(await apiFetch<StudentLeave[]>("/api/student-leaves")); }
    catch (e) { toast.push(errMsg(e, "Could not load student leave"), "error"); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const file = async () => {
    if (!form.student_id || !form.start_date || !form.end_date) return toast.push("Student and dates are required", "error");
    setBusy(true);
    try {
      await apiFetch("/api/student-leaves", { method: "POST", body: JSON.stringify({ ...form, reason: form.reason || undefined }) });
      setForm((f) => ({ ...f, start_date: "", end_date: "", reason: "" }));
      toast.push("Student leave submitted");
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const decide = async (remarks: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiFetch(`/api/student-leaves/${pending.leave.id}/decision`, {
        method: "PUT", body: JSON.stringify({ decision: pending.decision, remarks: remarks || undefined }),
      });
      toast.push(`Leave ${pending.decision.toLowerCase()} for ${pending.leave.student.fullName} — parent notified`);
      setPending(null);
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    const l = rows.find((x) => x.id === id);
    if (!(await confirmAction({
      title: l ? `Cancel leave request for ${l.student.fullName}?` : "Cancel this leave request?",
      text: l ? `${l.leaveType} · ${l.startDate} → ${l.endDate}. The request will be withdrawn.` : "The request will be withdrawn.",
      confirmText: "Cancel request",
      cancelText: "Keep",
      tone: "danger",
    }))) return;
    try { await apiFetch(`/api/student-leaves/${id}/cancel`, { method: "PUT" }); toast.push(l ? `Leave request cancelled for ${l.student.fullName}` : "Request cancelled"); await load(); }
    catch (e) { toast.push(errMsg(e), "error"); }
  };

  const shown = filter === "Pending" ? rows.filter((r) => r.status === "Pending") : rows;

  return (
    <div className="space-y-4">
      {canFile && (
        <Card>
          <CardHead title="File student leave" icon="students" subtitle="Parents can also request leave for their own child from the parent portal." />
          <div className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
            <Field label="Student" required>
              <Select aria-label="Student" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
              </Select>
            </Field>
            <Field label="Leave type">
              <Select aria-label="Leave type" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                {STUDENT_LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="From" required><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="To" required><Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Reason"><Input value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field></div>
          </div>
          <div className="px-4 pb-4"><Button variant="primary" onClick={file} loading={busy} className="max-md:w-full"><Icon name="check" className="h-4 w-4" /> Submit</Button></div>
        </Card>
      )}

      <Card>
        <CardHead
          title="Student leave requests"
          icon="clipboard"
          subtitle="Approved leave is shown to attendance as “on leave”."
          actions={<Tabs tabs={[{ id: "Pending", label: "Pending", count: rows.filter((r) => r.status === "Pending").length }, { id: "all", label: "All" }] as const} value={filter} onChange={setFilter} />}
        />
        <ul className="divide-y divide-line">
          {shown.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm max-md:gap-x-2 max-md:gap-y-1.5">
              <span className="font-semibold text-ink max-md:min-w-0 max-md:break-words">{l.student.fullName}</span>
              <span className="text-[12px] text-ink-3">{classLabel(l.student.class)}</span>
              <Badge tone="slate">{l.leaveType}</Badge>
              <span className="tnum text-ink-2 max-md:hidden">{l.startDate} → {l.endDate}</span><span className="tnum text-ink-2 md:hidden">{formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
              {l.reason && <span className="text-ink-3 max-md:w-full max-md:break-words">{l.reason}</span>}
              {l.remarks && <span className="text-[12px] italic text-ink-3 max-md:w-full max-md:break-words">“{l.remarks}”</span>}
              <span className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:mt-1 max-md:w-full max-md:flex-wrap">
                <Badge tone={statusBadge(l.status)}>{l.status}</Badge>
                {l.status === "Pending" && canDecide && (
                  <>
                    <Button size="sm" variant="soft" onClick={() => setPending({ leave: l, decision: "Approved" })} className="max-md:flex-1">Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setPending({ leave: l, decision: "Rejected" })} className="max-md:flex-1">Reject</Button>
                  </>
                )}
                {l.status === "Pending" && l.requestedBy === me.id && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(l.id)} className="max-md:flex-1">Cancel</Button>
                )}
              </span>
            </li>
          ))}
          {shown.length === 0 && <li><EmptyState title={filter === "Pending" ? "Nothing pending" : "No student leave yet"} icon="students" /></li>}
        </ul>
      </Card>

      <ReasonModal
        open={!!pending}
        title={pending?.decision === "Rejected" ? "Reject student leave" : "Approve student leave"}
        subtitle={pending ? `${pending.leave.student.fullName} · ${pending.leave.startDate} → ${pending.leave.endDate}` : ""}
        confirmLabel={pending?.decision === "Rejected" ? "Reject" : "Approve"}
        danger={pending?.decision === "Rejected"}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={decide}
      />
    </div>
  );
}
