"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ROLE, type Me } from "@/lib/auth";
import { Badge, Button, Field, Icon, IconButton, Input, Portal, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { NEXT_STATUS, SEVERITIES, classLabel, errMsg, severityTone, statusTone, type IncidentDetail } from "./shared";

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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.push(ok); setRemarks(""); await load(); onChanged(); }
    catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };
  const put = (path: string, body: object) => apiFetch(`/api/discipline/incidents/${id}${path}`, { method: "PUT", body: JSON.stringify(body) });

  const isPrincipal = me.role === ROLE.PRINCIPAL;
  const canDelete = me.role === ROLE.PRINCIPAL || me.role === ROLE.SUPER_ADMIN;

  return (
    <Portal>
      <div className="fixed inset-0 z-[90] flex justify-end">
        <div className="fixed inset-0 bg-navy-950/45 backdrop-blur-sm" style={{ animation: "fade-in 0.18s ease-out both" }} onClick={onClose} aria-hidden />
        <aside role="dialog" aria-modal="true" aria-label="Incident detail"
          className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-pop"
          style={{ animation: "fade-up 0.3s var(--ease-out-soft) both" }}>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="font-display text-[16px] font-bold text-ink">{inc?.student.fullName ?? "Incident"}</h2>
              {inc && <p className="text-[12px] text-ink-3"><span className="font-mono">{inc.student.admissionNo}</span>{classLabel(inc.student.class) ? ` · ${classLabel(inc.student.class)}` : ""} · {inc.incidentDate}</p>}
            </div>
            <IconButton name="x" label="Close" variant="ghost" onClick={onClose} />
          </div>

          <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
            {!inc ? (
              <div className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /></div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(inc.status)}>{inc.status}</Badge>
                  <Badge tone={severityTone(inc.severity)}>{inc.severity} severity</Badge>
                  <Badge tone="slate">{inc.demerits} demerit{inc.demerits === 1 ? "" : "s"}</Badge>
                </div>
                <section>
                  <h3 className="label">Account</h3>
                  <p className="whitespace-pre-wrap text-ink-2">{inc.description}</p>
                  {inc.actionTaken && <p className="mt-2 text-[12.5px] text-ink-3">Action taken: {inc.actionTaken}</p>}
                  <p className="mt-2 text-[12px] text-ink-3">Reported by {inc.reporter?.name ?? "school office"}</p>
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
                      <Button size="sm" variant="soft" className="mt-2" disabled={busy || notes === (inc.confidentialNotes ?? "")}
                        onClick={() => run(() => put("", { confidential_notes: notes }), "Notes saved")}>Save notes</Button>
                    </section>

                    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Case owner">
                        <Select aria-label="Case owner" value={inc.assignedTo ?? ""} disabled={busy}
                          onChange={(e) => run(() => put("", { assigned_to: e.target.value }), "Case owner updated")}>
                          <option value="">Unassigned</option>
                          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                        </Select>
                      </Field>
                      <Field label="Severity">
                        <Select aria-label="Severity" value={inc.severity} disabled={busy}
                          onChange={(e) => run(() => put("", { severity: e.target.value }), "Severity updated")}>
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
                            <Button key={s} size="sm" variant="soft" disabled={busy || (reopen && !remarks.trim())}
                              onClick={() => run(() => put("/status", { status: s, remarks: remarks || undefined }), `Moved to ${s}`)}>
                              {reopen ? "Re-open" : `Move to ${s}`}
                            </Button>
                          );
                        })}
                        {inc.status !== "Escalated" && inc.status !== "Closed" && (
                          <Button size="sm" variant="danger" disabled={busy}
                            onClick={() => run(() => apiFetch(`/api/discipline/incidents/${id}/escalate`, { method: "POST", body: JSON.stringify({ reason: remarks || undefined }) }), "Escalated to the Principal")}>
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
                              {h.detail && <span className="text-ink-3">{h.detail}</span>}
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
            <div className="flex justify-end border-t border-line bg-surface-2/70 px-5 py-3">
              <Button size="sm" variant="danger" disabled={busy}
                onClick={() => {
                  if (!window.confirm("Archive this record? It will be hidden from all lists but kept for the audit trail.")) return;
                  void run(() => apiFetch(`/api/discipline/incidents/${id}`, { method: "DELETE" }), "Record archived").then(onClose);
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
