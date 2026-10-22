"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, type Me } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, Tabs, useToast } from "@/components/ui";
import { ReasonModal } from "./ReasonModal";
import {
  GATE_PRINCIPAL_STEP, GATE_PRINT, GATE_REQUEST, GATE_TYPES, GATE_WARDEN_STEP, classLabel, errMsg, fmtStamp, fmtTime, statusBadge,
  type GatePass, type StudentOption,
} from "./shared";

const ISSUED = ["Approved", "Checked Out", "Returned"];

/** Gate passes: request → Warden → Principal (either may reject with a reason) → printable pass with QR. */
export function GatePassPanel({ me, students, refreshKey }: { me: Me; students: StudentOption[]; refreshKey?: number }) {
  const toast = useToast();
  const [rows, setRows] = useState<GatePass[]>([]);
  const [filter, setFilter] = useState<"action" | "all">("action");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<GatePass | null>(null);
  const [form, setForm] = useState({ student_id: "", type: "Local Outing", reason: "", out_time: "", expected_in_time: "" });

  const load = useCallback(async () => {
    try { setRows(await apiFetch<GatePass[]>("/api/gate-passes")); }
    catch (e) { toast.push(errMsg(e, "Could not load gate passes"), "error"); }
  }, [toast]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const wardenStep = hasRole(me, GATE_WARDEN_STEP);
  const principalStep = hasRole(me, GATE_PRINCIPAL_STEP);
  const mineToAct = (g: GatePass) => (g.status === "Pending" && wardenStep) || (g.status === "Warden Approved" && principalStep);

  const request = async () => {
    if (!form.student_id || !form.reason || !form.out_time) return toast.push("Student, reason and out time are required", "error");
    setBusy(true);
    try {
      await apiFetch("/api/gate-passes", {
        method: "POST",
        body: JSON.stringify({ ...form, expected_in_time: form.expected_in_time || undefined }),
      });
      setForm((f) => ({ ...f, reason: "", out_time: "", expected_in_time: "" }));
      toast.push("Gate pass requested — awaiting warden approval");
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const act = async (g: GatePass, step: "approve-warden" | "approve-principal") => {
    setBusy(true);
    try {
      await apiFetch(`/api/gate-passes/${g.id}/${step}`, { method: "PUT" });
      toast.push(step === "approve-principal" ? "Pass issued — parent sent the exit OTP" : "Approved — sent to the Principal");
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const reject = async (reason: string) => {
    if (!rejecting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/gate-passes/${rejecting.id}/reject`, { method: "PUT", body: JSON.stringify({ reason }) });
      toast.push("Gate pass rejected");
      setRejecting(null);
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const print = async (g: GatePass) => {
    try { await apiDownload(`/api/gate-passes/${g.id}/pass.pdf`, `gate-pass-${g.passCode ?? g.id}.pdf`); }
    catch (e) { toast.push(errMsg(e, "Download failed"), "error"); }
  };

  const shown = filter === "action" ? rows.filter(mineToAct) : rows;
  const actionable = rows.filter(mineToAct).length;

  return (
    <div className="space-y-4">
      {hasRole(me, GATE_REQUEST) && (
        <Card>
          <CardHead title="Request a gate pass" icon="door" subtitle="The parent is notified with a one-time exit code only once the Principal issues the pass." />
          <div className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
            <Field label="Student" required>
              <Select aria-label="Student" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
              </Select>
            </Field>
            <Field label="Pass type">
              <Select aria-label="Pass type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {GATE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Out time" required><Input type="datetime-local" value={form.out_time} onChange={(e) => setForm({ ...form, out_time: e.target.value })} /></Field>
            <Field label="Expected back"><Input type="datetime-local" value={form.expected_in_time} min={form.out_time} onChange={(e) => setForm({ ...form, expected_in_time: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Reason" required><Input value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field></div>
          </div>
          <div className="px-4 pb-4"><Button variant="primary" onClick={request} loading={busy}><Icon name="check" className="h-4 w-4" /> Request pass</Button></div>
        </Card>
      )}

      <Card>
        <CardHead
          title="Gate passes"
          icon="door"
          subtitle="Pending → Warden → Principal → issued. Security desk checks students out with the parent's code."
          actions={(wardenStep || principalStep) && (
            <Tabs tabs={[{ id: "action", label: "Needs me", count: actionable }, { id: "all", label: "All" }] as const} value={filter} onChange={setFilter} />
          )}
        />
        <ul className="divide-y divide-line">
          {(wardenStep || principalStep ? shown : rows).map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{g.student.fullName} <span className="text-[12px] font-normal text-ink-3">{classLabel(g.student.class)}</span></p>
                <p className="text-[12px] text-ink-3">
                  {g.type} · {g.reason} · out {fmtTime(g.outTime)}{g.expectedInTime ? ` · back ${fmtTime(g.expectedInTime)}` : ""}
                </p>
                {g.status === "Rejected" && g.rejectedReason && <p className="text-[12px] text-danger">Rejected: {g.rejectedReason}</p>}
                {g.actualOutTime && (
                  <p className="text-[12px] text-ink-3">
                    Left {fmtStamp(g.actualOutTime)}{g.checkedOutByName ? ` (${g.checkedOutByName})` : ""}
                    {g.actualInTime ? ` · returned ${fmtStamp(g.actualInTime)}` : ""}
                  </p>
                )}
              </div>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {g.passCode && <span className="font-mono text-[12px] text-ink-2">{g.passCode}</span>}
                {g.late && <Badge tone="rose">Late</Badge>}
                <Badge tone={statusBadge(g.status)}>{g.status}</Badge>
                {g.status === "Pending" && wardenStep && (
                  <Button size="sm" variant="soft" disabled={busy} onClick={() => act(g, "approve-warden")}>Warden approve</Button>
                )}
                {g.status === "Warden Approved" && principalStep && (
                  <Button size="sm" variant="soft" disabled={busy} onClick={() => act(g, "approve-principal")}>Issue pass</Button>
                )}
                {mineToAct(g) && <Button size="sm" variant="danger" onClick={() => setRejecting(g)}>Reject</Button>}
                {ISSUED.includes(g.status) && hasRole(me, GATE_PRINT) && (
                  <Button size="sm" variant="ghost" onClick={() => print(g)}><Icon name="download" className="h-3.5 w-3.5" /> Print pass</Button>
                )}
              </span>
            </li>
          ))}
          {(wardenStep || principalStep ? shown : rows).length === 0 && (
            <li><EmptyState title={filter === "action" && (wardenStep || principalStep) ? "Nothing waiting for you" : "No gate passes"} icon="door" /></li>
          )}
        </ul>
      </Card>

      <ReasonModal
        open={!!rejecting}
        title="Reject gate pass"
        subtitle={rejecting ? `${rejecting.student.fullName} · ${rejecting.type}` : ""}
        label="Reason"
        required
        confirmLabel="Reject"
        danger
        busy={busy}
        onClose={() => setRejecting(null)}
        onConfirm={reject}
      />
    </div>
  );
}
