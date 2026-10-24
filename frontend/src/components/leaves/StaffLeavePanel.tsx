"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { hasRole, R, type Me } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { CardBody, CardEmpty, CardGrid, CardTitle, Chip, Monogram, RecordCard, Ring, initials, toneFor, type Tone } from "@/components/RecordCard";
import { confirmAction } from "@/components/confirm";
import { ReasonModal } from "./ReasonModal";
import { LEAVE_ON_BEHALF, LEAVE_VIEW_ALL, STAFF_LEAVE_TYPES, errMsg, statusBadge, type Balance, type StaffLeave } from "./shared";

const QUOTA_TYPES: { type: string; tone: Tone }[] = [
  { type: "Casual", tone: "navy" },
  { type: "Sick", tone: "blue" },
  { type: "Earned", tone: "teal" },
  { type: "Duty", tone: "gold" },
];

/** "My leave": apply (self, or on behalf for HR/admins), own history + withdraw, own balance (all balances for HR/leadership). */
export function MyLeavePanel({ me, onChanged }: { me: Me; onChanged?: () => void }) {
  const toast = useToast();
  const onBehalf = hasRole(me, LEAVE_ON_BEHALF);
  const seeAll = hasRole(me, LEAVE_VIEW_ALL);
  const [mine, setMine] = useState<StaffLeave[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ staff_id: "", leave_type: "Casual", start_date: "", end_date: "", reason: "" });

  const load = useCallback(async () => {
    try {
      const [m, b] = await Promise.all([
        me.staff ? apiFetch<StaffLeave[]>("/api/staff-leaves?view=mine") : Promise.resolve([]),
        apiFetch<Balance[]>("/api/balances"),
      ]);
      setMine(m);
      setBalances(b);
    } catch (e) { toast.push(errMsg(e, "Could not load leave"), "error"); }
  }, [me.staff, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (onBehalf) apiFetch<{ id: string; name: string }[]>("/api/staff").then(setStaffList).catch(() => undefined);
  }, [onBehalf]);

  const apply = async () => {
    if (!form.start_date || !form.end_date) return toast.push("Start and end dates are required", "error");
    if (!me.staff && !form.staff_id) return toast.push("Your account has no staff record — choose a staff member", "error");
    setBusy(true);
    try {
      await apiFetch("/api/staff-leaves", {
        method: "POST",
        body: JSON.stringify({ ...form, staff_id: form.staff_id || undefined, reason: form.reason || undefined }),
      });
      setForm((f) => ({ ...f, start_date: "", end_date: "", reason: "" }));
      toast.push("Leave request submitted");
      await load();
      onChanged?.();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    const l = mine.find((x) => x.id === id);
    if (!(await confirmAction({
      title: l ? `Withdraw ${l.leaveType.toLowerCase()} leave (${l.startDate} → ${l.endDate})?` : "Withdraw this leave request?",
      text: "The request is cancelled and removed from the approval queue.",
      confirmText: "Withdraw",
      tone: "danger",
    }))) return;
    try {
      await apiFetch(`/api/staff-leaves/${id}/withdraw`, { method: "PUT" });
      toast.push("Leave withdrawn");
      await load();
      onChanged?.();
    } catch (e) { toast.push(errMsg(e), "error"); }
  };

  const own = balances.find((b) => b.staff_id === me.staff?.id);

  const balanceCards = (
    <CardGrid min="15rem" empty={<CardEmpty title="No active staff." icon="leaves" />}>
      {balances.map((b) => (
        <RecordCard key={b.staff_id}>
          <CardBody>
            <CardTitle
              lead={<Monogram text={initials(b.name)} tone={toneFor(b.role)} size="sm" shape="circle" />}
              title={b.name}
              subtitle={b.department ?? b.role}
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {QUOTA_TYPES.map(({ type, tone }) => {
                const l = b.leaves[type];
                const pct = l && l.quota > 0 ? (l.remaining / l.quota) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-2.5">
                    <Ring value={pct} tone={tone} size={44} stroke={5} label={`${type}: ${l?.remaining ?? 0} of ${l?.quota ?? 0} remaining`}>
                      {l?.remaining ?? 0}
                    </Ring>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink">{type}</p>
                      <p className="tnum text-[11px] text-ink-3">of {l?.quota ?? 0}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </RecordCard>
      ))}
    </CardGrid>
  );

  return (
    <div className="space-y-4">
      {own && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUOTA_TYPES.map(({ type, tone }) => {
            const l = own.leaves[type];
            return (
              <div key={type} className="card flex items-center gap-3 p-3 max-md:gap-2.5">
                <Ring value={l && l.quota ? (l.remaining / l.quota) * 100 : 0} tone={tone} size={48} stroke={5} label={`${type} remaining`}>
                  {l?.remaining ?? 0}
                </Ring>
                <div className="max-md:min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{type}</p>
                  <p className="tnum text-[11.5px] text-ink-3">{l?.used ?? 0} used of {l?.quota ?? 0}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <CardHead title={onBehalf ? "Apply for leave" : "Apply for my leave"} icon="leaves"
          subtitle={onBehalf ? "Leave blank to apply for yourself, or pick a colleague to file on their behalf." : "Requests go to your HOD, or to the Principal / HR."} />
        <div className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
          {onBehalf && (
            <Field label="Staff member">
              <Select aria-label="Staff member" value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
                <option value="">{me.staff ? "Myself" : "Select staff…"}</option>
                {staffList.filter((s) => s.id !== me.staff?.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Leave type">
            <Select aria-label="Leave type" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
              {STAFF_LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="From" required><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="To" required><Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Reason"><Input value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          </div>
        </div>
        <div className="px-4 pb-4">
          <Button variant="primary" onClick={apply} loading={busy} className="max-md:w-full"><Icon name="check" className="h-4 w-4" /> Submit request</Button>
        </div>
      </Card>

      {me.staff && (
        <Card>
          <CardHead title="My requests" icon="clipboard" />
          <ul className="divide-y divide-line">
            {mine.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Badge tone="slate">{l.leaveType}</Badge>
                <span className="tnum text-ink-2 max-md:hidden">{l.startDate} → {l.endDate}</span><span className="tnum text-ink-2 md:hidden">{formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
                {l.reason && <span className="text-ink-3 max-md:w-full max-md:break-words">{l.reason}</span>}
                {l.remarks && <span className="text-[12px] italic text-ink-3 max-md:w-full max-md:break-words">“{l.remarks}”</span>}
                <span className="ml-auto flex items-center gap-2 max-md:flex-wrap">
                  <Badge tone={statusBadge(l.status)}>{l.status}</Badge>
                  {l.status === "Pending" && <Button size="sm" variant="ghost" onClick={() => withdraw(l.id)} className="max-md:!min-h-11">Withdraw</Button>}
                </span>
              </li>
            ))}
            {mine.length === 0 && <li><EmptyState title="No leave requests yet" icon="leaves" /></li>}
          </ul>
        </Card>
      )}

      {seeAll && (
        <Card>
          <CardHead title={`Leave balances (${new Date().getFullYear()})`} icon="reports" subtitle="Approved leave counted against yearly quotas." />
          <TableView id="balances" cards={balanceCards}>
            <table className="w-full text-xs">
              <thead className="table-head">
                <tr><th className="px-4 py-2">Staff</th><th className="px-4 py-2">Department</th>{QUOTA_TYPES.map((q) => <th key={q.type} className="px-4 py-2">{q.type}</th>)}</tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.staff_id} className="row-hover border-t border-line">
                    <td className="px-4 py-2 font-semibold">{b.name}</td>
                    <td className="px-4 py-2 text-ink-3">{b.department ?? "—"}</td>
                    {QUOTA_TYPES.map(({ type }) => (
                      <td key={type} className="tnum px-4 py-2">{b.leaves[type]?.remaining ?? 0}<span className="text-ink-3">/{b.leaves[type]?.quota ?? 0}</span></td>
                    ))}
                  </tr>
                ))}
                {balances.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-ink-3">No active staff.</td></tr>}
              </tbody>
            </table>
          </TableView>
        </Card>
      )}
    </div>
  );
}

/** Approval queue: Pending staff leave the caller may decide (HOD = own department; Principal/VP/HR/admin = all). */
export function LeaveApprovalPanel({ me, refreshKey, onChanged }: { me: Me; refreshKey?: number; onChanged?: () => void }) {
  const toast = useToast();
  const [queue, setQueue] = useState<StaffLeave[]>([]);
  const [history, setHistory] = useState<StaffLeave[]>([]);
  const [pending, setPending] = useState<{ leave: StaffLeave; decision: "Approved" | "Rejected" } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await apiFetch<StaffLeave[]>("/api/staff-leaves");
      setQueue(all.filter((l) => l.can_decide));
      setHistory(all.filter((l) => l.status !== "Pending" && l.staffId !== me.staff?.id).slice(0, 30));
    } catch (e) { toast.push(errMsg(e, "Could not load approvals"), "error"); }
  }, [me.staff?.id, toast]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const decide = async (remarks: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiFetch(`/api/staff-leaves/${pending.leave.id}/decision`, {
        method: "PUT",
        body: JSON.stringify({ decision: pending.decision, remarks: remarks || undefined }),
      });
      toast.push(`Leave ${pending.decision.toLowerCase()} for ${pending.leave.staff.name}`);
      setPending(null);
      await load();
      onChanged?.();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const scope = hasRole(me, LEAVE_VIEW_ALL) ? "all staff" : `the ${me.staff?.department ?? "your"} department`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title="Awaiting your decision" icon="check" subtitle={`Pending leave for ${scope}. You can't decide your own leave.`} />
        <ul className="divide-y divide-line">
          {queue.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="font-semibold text-ink max-md:min-w-0 max-md:break-words">{l.staff.name}</span>
              {l.staff.department && <Chip>{l.staff.department}</Chip>}
              <Badge tone="slate">{l.leaveType}</Badge>
              <span className="tnum text-ink-2 max-md:hidden">{l.startDate} → {l.endDate}</span><span className="tnum text-ink-2 md:hidden">{formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
              {l.reason && <span className="text-ink-3 max-md:w-full max-md:break-words">{l.reason}</span>}
              <span className="ml-auto flex gap-2 max-md:ml-0 max-md:w-full">
                <Button size="sm" variant="soft" onClick={() => setPending({ leave: l, decision: "Approved" })} className="max-md:flex-1 max-md:!min-h-11">Approve</Button>
                <Button size="sm" variant="danger" onClick={() => setPending({ leave: l, decision: "Rejected" })} className="max-md:flex-1 max-md:!min-h-11">Reject</Button>
              </span>
            </li>
          ))}
          {queue.length === 0 && <li><EmptyState title="Queue is clear" hint="No pending leave needs your decision." icon="check" /></li>}
        </ul>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHead title="Recent decisions" icon="clock" />
          <ul className="divide-y divide-line">
            {history.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm max-md:gap-x-2 max-md:gap-y-1.5">
                <span className="font-semibold max-md:min-w-0 max-md:break-words">{l.staff.name}</span>
                <Badge tone="slate">{l.leaveType}</Badge>
                <span className="tnum text-ink-2 max-md:hidden">{l.startDate} → {l.endDate}</span><span className="tnum text-ink-2 md:hidden">{formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
                {l.approver && <span className="text-[12px] text-ink-3">by {l.approver.name}</span>}
                {l.remarks && <span className="text-[12px] italic text-ink-3 max-md:break-words">“{l.remarks}”</span>}
                <span className="ml-auto"><Badge tone={statusBadge(l.status)}>{l.status}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReasonModal
        open={!!pending}
        title={pending?.decision === "Rejected" ? "Reject leave" : "Approve leave"}
        subtitle={pending ? `${pending.leave.staff.name} · ${pending.leave.leaveType} · ${pending.leave.startDate} → ${pending.leave.endDate}` : ""}
        required={pending?.decision === "Rejected"}
        confirmLabel={pending?.decision === "Rejected" ? "Reject" : "Approve"}
        danger={pending?.decision === "Rejected"}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={decide}
      />
    </div>
  );
}

export const canApproveLeave = (me: Me | null) => hasRole(me, R.LEAVE_APPROVE);
