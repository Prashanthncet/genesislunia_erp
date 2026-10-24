"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { confirmAction } from "@/components/confirm";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, useToast } from "@/components/ui";
import { classLabel, errMsg, fmtStamp, fmtTime, statusBadge, type GatePass } from "./shared";

/**
 * Security desk: type or scan the pass code (QR on the printed pass encodes the same code),
 * verify the parent's one-time code to check the student out, check them back in on return.
 */
export function SecurityDesk({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [pass, setPass] = useState<GatePass | null>(null);
  const [otp, setOtp] = useState("");
  const [out, setOut] = useState<GatePass[]>([]);
  const [busy, setBusy] = useState(false);

  const loadOut = useCallback(async () => {
    try { setOut(await apiFetch<GatePass[]>("/api/gate-passes/out")); }
    catch (e) { toast.push(errMsg(e, "Could not load students out"), "error"); }
  }, [toast]);
  useEffect(() => {
    void loadOut();
    const t = setInterval(() => void loadOut(), 30_000);
    return () => clearInterval(t);
  }, [loadOut]);

  const lookup = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    try {
      setPass(await apiFetch<GatePass>(`/api/gate-passes/by-code/${encodeURIComponent(c)}`));
      setOtp("");
    } catch (e) { setPass(null); toast.push(errMsg(e, "Pass not found"), "error"); } finally { setBusy(false); }
  };

  const refresh = async (id: string) => {
    setPass(await apiFetch<GatePass>(`/api/gate-passes/${id}`));
    await loadOut();
    onChanged?.();
  };

  const checkout = async () => {
    if (!pass || !/^\d{6}$/.test(otp)) return toast.push("Enter the parent's 6-digit code", "error");
    if (!(await confirmAction({
      title: `Verify & check out ${pass.student.fullName}?`,
      text: `${pass.type} · back by ${fmtTime(pass.expectedInTime)}. The exit time is recorded now.`,
      confirmText: "Check out",
      tone: "primary",
    }))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/gate-passes/${pass.id}/checkout`, { method: "PUT", body: JSON.stringify({ otp }) });
      toast.push(`${pass.student.fullName} checked out`);
      setOtp("");
      await refresh(pass.id);
    } catch (e) { toast.push(errMsg(e, "Invalid code"), "error"); } finally { setBusy(false); }
  };

  const checkin = async (g: GatePass) => {
    if (!(await confirmAction({
      title: `Check in ${g.student.fullName}?`,
      text: "Records the student as returned to campus now.",
      confirmText: "Check in",
      tone: "primary",
    }))) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ late: boolean }>(`/api/gate-passes/${g.id}/checkin`, { method: "PUT" });
      toast.push(`${g.student.fullName} checked in${r.late ? " (late)" : ""}`, r.late ? "info" : "success");
      if (pass?.id === g.id) await refresh(g.id); else { await loadOut(); onChanged?.(); }
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 max-lg:grid-cols-1 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHead title="Verify a pass" icon="key" subtitle="Scan the QR on the printed pass, or type the 10-character code." />
        <div className="space-y-4 p-4">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
            <Input
              aria-label="Pass code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. G5VWDVNJ9T"
              maxLength={16}
              autoComplete="off"
              className="field flex-1 font-mono tracking-widest max-md:basis-full max-md:!min-h-14 max-md:!text-xl max-md:text-center"
            />
            <Button variant="primary" type="submit" loading={busy} className="max-md:w-full max-md:!min-h-12"><Icon name="search" className="h-4 w-4" /> Look up</Button>
          </form>

          {pass ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="max-md:min-w-0 max-md:break-words">
                  <p className="font-display text-[17px] font-semibold text-ink">{pass.student.fullName}</p>
                  <p className="text-[12.5px] text-ink-3">
                    <span className="font-mono">{pass.student.admissionNo}</span>{classLabel(pass.student.class) ? ` · ${classLabel(pass.student.class)}` : ""}
                  </p>
                </div>
                <span className="flex gap-2">{pass.late && <Badge tone="rose">Late</Badge>}<Badge tone={statusBadge(pass.status)}>{pass.status}</Badge></span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] max-md:[&>div]:min-w-0">
                <div><dt className="text-ink-3">Type</dt><dd className="font-medium">{pass.type}</dd></div>
                <div className="max-md:col-span-2"><dt className="text-ink-3">Reason</dt><dd className="font-medium max-md:break-words">{pass.reason}</dd></div>
                <div><dt className="text-ink-3">Out (planned)</dt><dd className="tnum font-medium">{fmtTime(pass.outTime)}</dd></div>
                <div><dt className="text-ink-3">Back by</dt><dd className="tnum font-medium">{fmtTime(pass.expectedInTime)}</dd></div>
                <div><dt className="text-ink-3">Warden</dt><dd className="font-medium">{pass.approvedByWardenName ?? "—"}</dd></div>
                <div><dt className="text-ink-3">Principal</dt><dd className="font-medium">{pass.approvedByPrincipalName ?? "—"}</dd></div>
                {pass.actualOutTime && <div><dt className="text-ink-3">Left</dt><dd className="tnum font-medium">{fmtStamp(pass.actualOutTime)}</dd></div>}
                {pass.actualInTime && <div><dt className="text-ink-3">Returned</dt><dd className="tnum font-medium">{fmtStamp(pass.actualInTime)}</dd></div>}
              </dl>

              {pass.status === "Approved" && (
                <form className="flex flex-wrap items-end gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); void checkout(); }}>
                  <div className="max-md:w-full">
                    <Field label="Parent's one-time code">
                      <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
                        autoComplete="one-time-code" placeholder="6 digits" className="field w-36 tnum tracking-[0.3em] max-md:!w-full max-md:!min-h-14 max-md:!text-xl max-md:text-center" />
                    </Field>
                  </div>
                  <Button variant="primary" type="submit" loading={busy} disabled={otp.length !== 6} className="max-md:w-full max-md:!min-h-12">
                    <Icon name="check" className="h-4 w-4" /> Verify & check out
                  </Button>
                </form>
              )}
              {pass.status === "Checked Out" && (
                <Button variant="primary" loading={busy} onClick={() => checkin(pass)} className="max-md:w-full max-md:!min-h-12"><Icon name="door" className="h-4 w-4" /> Check in (returned)</Button>
              )}
              {!["Approved", "Checked Out"].includes(pass.status) && (
                <p className="text-[12.5px] text-ink-3">
                  {pass.status === "Returned" ? "This pass has been used." : "This pass is not issued — the student may not leave on it."}
                </p>
              )}
            </div>
          ) : (
            <EmptyState title="No pass loaded" hint="Look up a pass code to see the student and verify the parent's code." icon="key" />
          )}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHead title="Currently off campus" icon="user" subtitle="Refreshes every 30 seconds." actions={<Badge tone="sky">{out.length}</Badge>} />
        <ul className="divide-y divide-line">
          {out.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{g.student.fullName}</p>
                <p className="text-[12px] text-ink-3">left {fmtStamp(g.actualOutTime)} · back {fmtTime(g.expectedInTime)}</p>
              </div>
              {g.late && <Badge tone="rose">Late</Badge>}
              <Button size="sm" variant="soft" disabled={busy} onClick={() => checkin(g)} className="max-md:!min-h-11 max-md:shrink-0">Check in</Button>
            </li>
          ))}
          {out.length === 0 && <li><EmptyState title="Everyone is on campus" icon="check" /></li>}
        </ul>
      </Card>
    </div>
  );
}
