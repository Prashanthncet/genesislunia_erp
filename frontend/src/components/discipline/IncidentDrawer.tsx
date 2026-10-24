"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ROLE, type Me } from "@/lib/auth";
import { Badge, Button, Field, Icon, IconButton, Input, Portal, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
import { formatDate } from "@/lib/format";
import { NEXT_STATUS, SEVERITIES, classLabel, errMsg, severityTone, statusTone, type IncidentDetail } from "./shared";
import { useMobileBack } from "@/components/mobile/useMobileBack";

/**
 * Side drawer for one incident. Always loads through the audited detail endpoint, so
 * opening the drawer is itself logged. Case-team users get the full case + confidential
 * panel; reporters get the restricted view.
 */
export function IncidentDrawer({ id, me, caseTeam, onClose, onChanged }: {
  id: string; me: Me; caseTeam: boolean; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [inc, setInc] = useState<IncidentDetail | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string | null; email: string; role: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<IncidentDetail>(`/api/discipline/incidents/${id}`);
      setInc(d);
      setNotes(d.confidentialNotes ?? "");
    } catch (e) { toast.push(errMsg(e, "Could not open incident"), "error"); onClose(); }
  }, [id, toast, onClose]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (caseTeam) apiFetch<typeof assignees>("/api/discipline/assignees").then(setAssignees).catch(() => undefined);
  }, [caseTeam]);
  useEffect(() => {
    // Escape inside an open confirmation closes only that popup, not the drawer.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".swal2-container")) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.push(ok); setRemarks(""); await load(); onChanged(); }
    catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };
  /** Confirm first (SweetAlert), then run the mutation. */
  const confirmRun = async (opts: Parameters<typeof confirmAction>[0], fn: () => Promise<unknown>, ok: string) => {
    if (!(await confirmAction(opts))) return;
    await run(fn, ok);
  };
  const who = inc?.student.fullName ?? "this incident";
  const put = (path: string, body: object) => apiFetch(`/api/discipline/incidents/${id}${path}`, { method: "PUT", body: JSON.stringify(body) });

  useMobileBack(true, onClose);
  const isPrincipal = me.role === ROLE.PRINCIPAL;
  const canDelete = me.role === ROLE.PRINCIPAL || me.role === ROLE.SUPER_ADMIN;

  return (
    <Portal>
      <div className="fixed inset-0 z-[90] flex justify-end">
        <div className="fixed inset-0 bg-navy-950/45 backdrop-blur-sm" style={{ animation: "fade-in 0.18s ease-out both" }} onClick={onClose} aria-hidden />
        <aside role="dialog" aria-modal="true" aria-label="Incident detail"
          className="m-page relative z-10 flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-pop max-md:border-l-0 max-md:pb-[var(--m-safe-bottom)] max-md:pt-[var(--m-safe-top)]"
          style={{ animation: "fade-up 0.3s var(--ease-out-soft) both" }}>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 max-md:items-center max-md:justify-start max-md:gap-2 max-md:px-2 max-md:py-2">
            <button type="button" onClick={onClose} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface-2 md:hidden">
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
            <div className="min-w-0 max-md:flex-1">
              <h2 className="font-display text-[16px] font-bold text-ink max-md:break-words">{inc?.student.fullName ?? "Incident"}</h2>
              {inc && <p className="text-[12px] text-ink-3 max-md:hidden"><span className="font-mono">{inc.student.admissionNo}</span>{classLabel(inc.student.class) ? ` · ${classLabel(inc.student.class)}` : ""} · {inc.incidentDate}</p>}
            </div>
            <span className="contents max-md:hidden"><IconButton name="x" label="Close" variant="ghost" onClick={onClose} /></span>
          </div>

          <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm max-md:px-4">
            {!inc ? (
              <div className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /></div>
            ) : (
              <>
                {/* Phones: one aligned label/value block in place of the header subline, badge row and "Reported by" line. */}
                <section className="md:hidden">
                  <h3 className="label">Details</h3>
                  <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 rounded-xl border border-line bg-surface-2/60 p-3 text-[13px]">
                    <dt className="text-[12px] text-ink-3">Status</dt>
                    <dd><Badge tone={statusTone(inc.status)}>{inc.status}</Badge></dd>
                    <dt className="text-[12px] text-ink-3">Severity</dt>
                    <dd><Badge tone={severityTone(inc.severity)}>{inc.severity}</Badge></dd>
                    <dt className="text-[12px] text-ink-3">Incident date</dt>
                    <dd className="tnum font-medium text-ink">{formatDate(inc.incidentDate)}</dd>
                    <dt className="text-[12px] text-ink-3">Admission no.</dt>
                    <dd className="font-mono text-ink break-words">{inc.student.admissionNo}</dd>
                    <dt className="text-[12px] text-ink-3">Class</dt>
                    <dd className="font-medium text-ink">{classLabel(inc.student.class) || "—"}</dd>
                    <dt className="text-[12px] text-ink-3">Demerits</dt>
                    <dd className="tnum font-medium text-ink">{inc.demerits}</dd>
                    <dt className="text-[12px] text-ink-3">Reported by</dt>
                    <dd className="font-medium text-ink break-words">{inc.reporter?.name ?? "school office"}</dd>
                  </dl>
                </section>
                <div className="flex flex-wrap gap-2 max-md:hidden">
                  <Badge tone={statusTone(inc.status)}>{inc.status}</Badge>
                  <Badge tone={severityTone(inc.severity)}>{inc.severity} severity</Badge>
                  <Badge tone="slate">{inc.demerits} demerit{inc.demerits === 1 ? "" : "s"}</Badge>
                </div>
                <section>
                  <h3 className="label">Account</h3>
                  <p className="whitespace-pre-wrap text-ink-2 max-md:break-words">{inc.description}</p>
                  {inc.actionTaken && <p className="mt-2 text-[12.5px] text-ink-3">Action taken: {inc.actionTaken}</p>}
                  <p className="mt-2 text-[12px] text-ink-3 max-md:hidden">Reported by {inc.reporter?.name ?? "school office"}</p>
                </section>

                {!caseTeam && (
                  <div className="flex gap-2 rounded-lg border border-line bg-surface-2 p-3 text-[12.5px] text-ink-3">
                    <Icon name="lock" className="h-4 w-4 shrink-0" />
                    You are seeing your own report. Confidential notes, case ownership and the case history are visible only to the Principal and the safeguarding team.
                  </div>
                )}

                {caseTeam && (
                  <>
                    <section className="rounded-xl border border-danger/40 bg-danger-soft/50 p-3">
                      <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-danger-ink">
                        <Icon name="lock" className="h-4 w-4" /> Restricted — access is logged
                      </div>
                      <p className="mb-2 text-[12px] text-ink-3">Confidential notes. Every view and edit of this record is written to the safeguarding audit log with your name.</p>
                      <Textarea aria-label="Confidential notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
                      <Button size="sm" variant="soft" className="mt-2 max-md:w-full" disabled={busy || notes === (inc.confidentialNotes ?? "")}
                        onClick={() => confirmRun({ title: `Save confidential notes for ${who}?`, text: "The edit is written to the safeguarding audit log with your name.", confirmText: "Save notes", tone: "primary" },
                          () => put("", { confidential_notes: notes }), `Notes saved for ${who}`)}>Save notes</Button>
                    </section>

                    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <h3 className="label !mb-0 sm:col-span-2 md:!hidden">Case management</h3>
                      <Field label="Case owner">
                        <Select aria-label="Case owner" value={inc.assignedTo ?? ""} disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value;
                            const a = assignees.find((x) => x.id === v);
                            const name = a ? a.name || a.email : "Unassigned";
                            void confirmRun({ title: v ? `Assign ${who}'s case to ${name}?` : `Unassign ${who}'s case?`, confirmText: v ? "Assign" : "Unassign", tone: "primary" },
                              () => put("", { assigned_to: v }), v ? `Case owner set to ${name}` : "Case owner removed");
                          }}>
                          <option value="">Unassigned</option>
                          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                        </Select>
                      </Field>
                      <Field label="Severity">
                        <Select aria-label="Severity" value={inc.severity} disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value;
                            void confirmRun({ title: `Change severity to ${v}?`, text: `${who} · currently ${inc.severity}.`, confirmText: "Update", tone: "primary" },
                              () => put("", { severity: v }), `Severity set to ${v} for ${who}`);
                          }}>
                          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                        </Select>
                      </Field>
                    </section>

                    <section className="space-y-2">
                      <h3 className="label">Status</h3>
                      {inc.status === "Escalated" && inc.escalatedAt && (
                        <p className="text-[12px] text-ink-3">Escalated {new Date(inc.escalatedAt).toLocaleString("en-IN")} by {inc.escalatedByName ?? "—"}</p>
                      )}
                      <Input aria-label="Remarks" value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)}
                        placeholder={inc.status === "Closed" ? "Remarks (required to re-open)" : "Remarks (optional, kept in the audit trail)"} />
                      <div className="flex flex-wrap gap-2">
                        {(NEXT_STATUS[inc.status] ?? []).map((s) => {
                          const reopen = inc.status === "Closed";
                          if (reopen && !isPrincipal) return null;
                          return (
                            <Button key={s} size="sm" variant="soft" className="max-md:flex-1" disabled={busy || (reopen && !remarks.trim())}
                              onClick={() => confirmRun({
                                title: reopen ? `Re-open ${who}'s case?` : `Move ${who}'s case to ${s}?`,
                                text: `Status changes from ${inc.status} to ${s}.${remarks.trim() ? " Your remarks are kept in the audit trail." : ""}`,
                                confirmText: reopen ? "Re-open" : `Move to ${s}`,
                                tone: "primary",
                              }, () => put("/status", { status: s, remarks: remarks || undefined }), `${who}'s case moved to ${s}`)}>
                              {reopen ? "Re-open" : `Move to ${s}`}
                            </Button>
                          );
                        })}
                        {inc.status !== "Escalated" && inc.status !== "Closed" && (
                          <Button size="sm" variant="danger" disabled={busy} className="max-md:w-full"
                            onClick={() => confirmRun({
                              title: `Escalate ${who}'s case to the Principal?`,
                              text: "The Principal is notified and the case is marked Escalated.",
                              confirmText: "Escalate",
                              tone: "primary",
                            }, () => apiFetch(`/api/discipline/incidents/${id}/escalate`, { method: "POST", body: JSON.stringify({ reason: remarks || undefined }) }), `${who}'s case escalated to the Principal`)}>
                            <Icon name="flag" className="h-3.5 w-3.5" /> Escalate to Principal
                          </Button>
                        )}
                      </div>
                      {inc.status === "Closed" && !isPrincipal && <p className="text-[12px] text-ink-3">Only the Principal can re-open a closed case.</p>}
                    </section>

                    {inc.history && inc.history.length > 0 && (
                      <section>
                        <h3 className="label">Access & change history</h3>
                        <ul className="space-y-1">
                          {inc.history.map((h) => (
                            <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-[12px]">
                              <Badge tone={h.action === "VIEW" || h.action === "LIST" ? "sky" : h.action === "ESCALATE" || h.action === "DELETE" ? "rose" : "emerald"}>{h.action}</Badge>
                              <span className="text-ink-2">{h.actorName}</span>
                              {h.detail && <span className="text-ink-3 max-md:min-w-0 max-md:break-words">{h.detail}</span>}
                              <span className="ml-auto text-ink-3">{new Date(h.createdAt).toLocaleString("en-IN")}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {inc && caseTeam && canDelete && (
            <div className="flex justify-end border-t border-line bg-surface-2/70 px-5 py-3 max-md:px-4">
              <Button size="sm" variant="danger" disabled={busy} className="max-md:w-full"
                onClick={async () => {
                  if (!(await confirmAction({
                    title: `Archive ${who}'s record?`,
                    text: "It will be hidden from all lists but kept for the audit trail.",
                    confirmText: "Archive",
                    tone: "danger",
                  }))) return;
                  void run(() => apiFetch(`/api/discipline/incidents/${id}`, { method: "DELETE" }), `${who}'s record archived`).then(onClose);
                }}>
                <Icon name="trash" className="h-3.5 w-3.5" /> Archive (soft delete)
              </Button>
            </div>
          )}
        </aside>
      </div>
    </Portal>
  );
}
