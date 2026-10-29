"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, type Me } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, Tabs, useToast } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
import { ReasonModal } from "./ReasonModal";
import {
  GATE_PRINCIPAL_STEP, GATE_PRINT, GATE_REQUEST, GATE_TYPES, GATE_WARDEN_STEP, classLabel, errMsg, fmtStamp, fmtTime, statusBadge,
  type GatePass, type StudentOption,
} from "./shared";

const ISSUED = ["Approved", "Checked Out", "Returned"];
const STATUS_OPTIONS = ["Pending", "Warden Approved", "Approved", "Checked Out", "Returned", "Rejected"] as const;

/** Gate passes: request → Warden → Principal (either may reject with a reason) → printable pass with QR. */
export function GatePassPanel({
  me, students, refreshKey, showRequest = true, onChanged,
}: {
  me: Me; students: StudentOption[]; refreshKey?: number;
  /** false on the Gate Desk, which has its own "Issue pass" tab. */
  showRequest?: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<GatePass[]>([]);
  const [filter, setFilter] = useState<"action" | "all">("action");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const mineToAct = useCallback(
    (g: GatePass) => (g.status === "Pending" && wardenStep) || (g.status === "Warden Approved" && principalStep),
    [wardenStep, principalStep],
  );

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
    const principal = step === "approve-principal";
    if (!(await confirmAction({
      title: principal ? `Issue gate pass for ${g.student.fullName}?` : `Approve gate pass for ${g.student.fullName}?`,
      text: principal
        ? `${g.type} · out ${fmtTime(g.outTime)}. The parent will be sent the one-time exit code.`
        : `${g.type} · out ${fmtTime(g.outTime)}. It will go to the Principal for final approval.`,
      confirmText: principal ? "Issue pass" : "Approve",
      tone: "primary",
    }))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/gate-passes/${g.id}/${step}`, { method: "PUT" });
      toast.push(step === "approve-principal" ? `Pass issued for ${g.student.fullName} — parent sent the exit OTP` : `Approved for ${g.student.fullName} — sent to the Principal`);
      await load();
      onChanged?.();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const reject = async (reason: string) => {
    if (!rejecting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/gate-passes/${rejecting.id}/reject`, { method: "PUT", body: JSON.stringify({ reason }) });
      toast.push(`Gate pass rejected for ${rejecting.student.fullName}`);
      setRejecting(null);
      await load();
      onChanged?.();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const print = async (g: GatePass) => {
    try { await apiDownload(`/api/gate-passes/${g.id}/pass.pdf`, `gate-pass-${g.passCode ?? g.id}.pdf`); }
    catch (e) { toast.push(errMsg(e, "Download failed"), "error"); }
  };

  const actionable = rows.filter(mineToAct).length;
  const visibleRows = useMemo(() => {
    const base = (wardenStep || principalStep) && filter === "action" ? rows.filter(mineToAct) : rows;
    return base.filter((g) => {
      if (typeFilter && g.type !== typeFilter) return false;
      if (statusFilter && g.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${g.student.fullName} ${g.student.admissionNo} ${classLabel(g.student.class)} ${g.passCode ?? ""} ${g.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, wardenStep, principalStep, filter, mineToAct, typeFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {showRequest && hasRole(me, GATE_REQUEST) && (
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
          <div className="px-4 pb-4"><Button variant="primary" onClick={request} loading={busy} className="max-md:w-full"><Icon name="check" className="h-4 w-4" /> Request pass</Button></div>
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
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-surface-2/50 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, admission no., pass code or reason…"
              aria-label="Search gate passes"
              className="!pl-9 w-full bg-white"
            />
          </div>
          <Select
            aria-label="Filter by pass type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-auto bg-white max-md:!w-full"
          >
            <option value="">All pass types</option>
            {GATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select
            aria-label="Filter by pass status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto bg-white max-md:!w-full"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
          </Select>
          {(searchQuery.trim() || typeFilter || statusFilter) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("");
                setStatusFilter("");
              }}
            >
              Clear filter
            </Button>
          )}
        </div>
        <ul className="divide-y divide-line">
          {visibleRows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm max-md:py-4">
              <div className="min-w-0 max-md:w-full max-md:break-words">
                <p className="font-semibold text-ink max-md:hidden">{g.student.fullName} <span className="text-[12px] font-normal text-ink-3">{classLabel(g.student.class)}</span></p>
                {/* Phones: who + status on one line. */}
                <div className="flex items-start justify-between gap-3 md:hidden">
                  <p className="min-w-0 text-[15px] font-semibold leading-snug text-ink">
                    {g.student.fullName}
                    <span className="block text-[12.5px] font-normal text-ink-3">{classLabel(g.student.class)}</span>
                  </p>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {g.late && <Badge tone="rose">Late</Badge>}
                    <Badge tone={statusBadge(g.status)}>{g.status}</Badge>
                  </span>
                </div>
                <p className="text-[12px] text-ink-3 max-md:hidden">
                  {g.type} · {g.reason} · out {fmtTime(g.outTime)}{g.expectedInTime ? ` · back ${fmtTime(g.expectedInTime)}` : ""}
                </p>
                {/* Phones: dates first on their own line, reason clamped under them. */}
                <p className="tnum mt-1.5 text-[12.5px] text-ink-2 md:hidden">
                  {g.type} · out {fmtTime(g.outTime)}{g.expectedInTime ? ` · back ${fmtTime(g.expectedInTime)}` : ""}{g.passCode ? ` · Pass ${g.passCode}` : ""}
                </p>
                <p className="line-clamp-2 text-[12px] text-ink-3 md:hidden" title={g.reason}>{g.reason}</p>
                {g.status === "Rejected" && g.rejectedReason && <p className="text-[12px] text-danger">Rejected: {g.rejectedReason}</p>}
                {g.actualOutTime && (
                  <p className="text-[12px] text-ink-3">
                    Left {fmtStamp(g.actualOutTime)}{g.checkedOutByName ? ` (${g.checkedOutByName})` : ""}
                    {g.actualInTime ? ` · returned ${fmtStamp(g.actualInTime)}` : ""}
                  </p>
                )}
              </div>
              <span className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:mt-1 max-md:grid max-md:w-full max-md:grid-cols-2">
                <span className="contents max-md:hidden">
                  {g.passCode && <span className="font-mono text-[12px] text-ink-2">{g.passCode}</span>}
                  {g.late && <Badge tone="rose">Late</Badge>}
                  <Badge tone={statusBadge(g.status)}>{g.status}</Badge>
                </span>
                {g.status === "Pending" && wardenStep && (
                  <Button size="sm" variant="soft" disabled={busy} onClick={() => act(g, "approve-warden")} className="max-md:order-2 max-md:!min-h-11">Warden approve</Button>
                )}
                {g.status === "Warden Approved" && principalStep && (
                  <Button size="sm" variant="soft" disabled={busy} onClick={() => act(g, "approve-principal")} className="max-md:order-2 max-md:!min-h-11">Issue pass</Button>
                )}
                {mineToAct(g) && <Button size="sm" variant="danger" onClick={() => setRejecting(g)} className="max-md:order-1 max-md:!min-h-11">Reject</Button>}
                {ISSUED.includes(g.status) && hasRole(me, GATE_PRINT) && (
                  <Button size="sm" variant="ghost" onClick={() => print(g)} className="max-md:order-3 max-md:col-span-2 max-md:!min-h-11"><Icon name="download" className="h-3.5 w-3.5" /> Print pass</Button>
                )}
              </span>
            </li>
          ))}
          {visibleRows.length === 0 && (
            <li><EmptyState title={filter === "action" && (wardenStep || principalStep) ? "Nothing waiting for you" : "No gate passes match"} icon="door" /></li>
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
