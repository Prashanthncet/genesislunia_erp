"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Icon, Modal, PageHeader, Reveal, Select, Skeleton, StatCard, Tabs, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { ReportIncidentForm } from "@/components/discipline/ReportIncidentForm";
import { IncidentDrawer } from "@/components/discipline/IncidentDrawer";
import { SEVERITIES, STATUSES, classLabel, errMsg, severityTone, statusTone, type AuditEntry, type IncidentRow } from "@/components/discipline/shared";

type View = "cases" | "mine" | "report";

/**
 * Discipline & safeguarding.
 *  - All staff: report an incident, see the reports they filed (no confidential fields).
 *  - Case team (super_admin, principal, discipline_officer): case dashboard, detail drawer with
 *    confidential notes, escalation, audit log. School admins are deliberately NOT on the case team.
 * Every list and detail read is audited server-side.
 */
export default function DisciplinePage() {
  const { me, loading } = useMe();
  const toast = useToast();
  const caseTeam = hasRole(me, R.SAFEGUARDING);
  const [view, setView] = useState<View>("mine");
  const [cases, setCases] = useState<IncidentRow[]>([]);
  const [mine, setMine] = useState<IncidentRow[]>([]);
  const [students, setStudents] = useState<{ id: string; fullName: string; admissionNo: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [severityFilter, setSeverityFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (caseTeam) setView("cases"); }, [caseTeam]);

  const load = useCallback(async () => {
    if (!me || isPortal(me)) return;
    setBusy(true);
    try {
      if (caseTeam) setCases(await apiFetch<IncidentRow[]>("/api/discipline/incidents"));
      else setMine(await apiFetch<IncidentRow[]>("/api/discipline/incidents/mine"));
    } catch (e) { toast.push(errMsg(e, "Could not load incidents"), "error"); } finally { setBusy(false); }
  }, [me, caseTeam, toast]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!me || !hasRole(me, R.STUDENT_READ)) return;
    apiFetch<{ data: { id: string; fullName: string; admissionNo: string }[] }>("/api/students?page_size=200")
      .then((r) => setStudents(r.data ?? []))
      .catch(() => undefined);
  }, [me]);

  const closeDrawer = useCallback(() => setOpenId(null), []);

  const openAudit = async () => {
    try { setAudit(await apiFetch<AuditEntry[]>("/api/discipline/audit-log")); }
    catch (e) { toast.push(errMsg(e, "Audit log is restricted"), "error"); }
  };

  const rows = caseTeam ? cases : mine;
  const shown = useMemo(() => rows.filter((i) =>
    (statusFilter === "all" || (statusFilter === "active" ? i.status !== "Closed" : i.status === statusFilter)) &&
    (!severityFilter || i.severity === severityFilter)), [rows, statusFilter, severityFilter]);
  const count = (s: string) => cases.filter((i) => i.status === s).length;

  if (loading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (!me || isPortal(me) || !hasRole(me, R.STAFF)) {
    return <div className="card"><EmptyState title="You don't have access to this page" icon="lock" /></div>;
  }

  const tabs: { id: View; label: string }[] = caseTeam
    ? [{ id: "cases", label: "Case dashboard" }, { id: "report", label: "Report an incident" }]
    : [{ id: "mine", label: "My reports" }, { id: "report", label: "Report an incident" }];

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="discipline"
          title="Discipline & Safeguarding"
          subtitle={caseTeam
            ? "Case tracking for the safeguarding team. Every record you open is logged."
            : "Report a concern about a student. Case files are handled by the Principal and the safeguarding team."}
          actions={caseTeam && (
            <Button variant="soft" onClick={openAudit}><Icon name="shield" className="h-4 w-4" /> Audit log</Button>
          )}
        />
      </Reveal>

      {caseTeam ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Reveal delay={40}><StatCard label="Open" value={count("Open")} tone="rose" icon="alert" /></Reveal>
          <Reveal delay={80}><StatCard label="Under Review" value={count("Under Review")} tone="amber" icon="eye" /></Reveal>
          <Reveal delay={120}><StatCard label="Escalated" value={count("Escalated")} tone="violet" icon="flag" /></Reveal>
          <Reveal delay={160}><StatCard label="Closed" value={count("Closed")} tone="emerald" icon="check" /></Reveal>
        </div>
      ) : (
        <Reveal delay={40}>
          <div className="flex gap-3 rounded-xl border border-line bg-surface-2 p-4 text-[13px] text-ink-2">
            <Icon name="lock" className="h-5 w-5 shrink-0 text-brand-700" />
            <p>
              Safeguarding records are restricted. You can report incidents and follow the status of the reports <em>you</em> filed;
              confidential notes and other staff members&apos; reports are visible only to the Principal and the Discipline/Safeguarding team.
              {hasRole(me, R.ADMINS) && " School administrators are intentionally not on the case team."}
            </p>
          </div>
        </Reveal>
      )}

      <Reveal delay={60}><Tabs tabs={tabs} value={view} onChange={setView} /></Reveal>

      <div key={view} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {view === "report" && (
          <ReportIncidentForm students={students} onCreated={() => { void load(); setView(caseTeam ? "cases" : "mine"); }} />
        )}

        {view !== "report" && (
          <Card>
            <CardHead
              title={caseTeam ? "Cases" : "My reports"}
              icon="clipboard"
              subtitle={caseTeam ? "Open a case to see confidential notes and its access history." : "Status updates on incidents you reported."}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Select aria-label="Filter by status" className="field w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="active">Not closed</option>
                    <option value="all">All statuses</option>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                  <Select aria-label="Filter by severity" className="field w-auto" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                    <option value="">All severities</option>
                    {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </div>
              }
            />
            <TableView id="incidents" title="Student">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Date</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Severity</th><th className="px-4 py-3">Status</th>
                    {caseTeam && <th className="px-4 py-3">Reported by</th>}
                    <th className="px-4 py-3 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id} className="row-hover border-t border-line">
                      <td className="tnum px-4 py-3 text-xs">{i.incidentDate}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{i.student.fullName}</span>
                        <span className="block text-[11.5px] text-ink-3">{classLabel(i.student.class)}</span>
                      </td>
                      <td className="max-w-xs px-4 py-3"><span className="line-clamp-2">{i.description}</span></td>
                      <td className="px-4 py-3"><Badge tone={severityTone(i.severity)}>{i.severity}</Badge></td>
                      <td className="px-4 py-3"><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                      {caseTeam && <td className="px-4 py-3 text-xs text-ink-3">{i.reporter?.name ?? "—"}</td>}
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="soft" onClick={() => setOpenId(i.id)}>
                          {caseTeam && <Icon name="lock" className="h-3.5 w-3.5" />} View
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={caseTeam ? 7 : 6} className="px-4 py-8 text-center text-ink-3">
                      {busy ? "Loading…" : caseTeam ? "No cases match these filters." : "You haven't reported any incidents."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </TableView>
          </Card>
        )}
      </div>

      {openId && <IncidentDrawer id={openId} me={me} caseTeam={caseTeam} onClose={closeDrawer} onChanged={() => void load()} />}

      <Modal open={!!audit} onClose={() => setAudit(null)} title="Safeguarding audit log" subtitle="Who listed, viewed or changed safeguarding records (latest 300)." size="lg">
        <ul className="space-y-1 text-sm">
          {(audit ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2/70 px-3 py-2">
              <Badge tone={a.action === "VIEW" || a.action === "LIST" ? "sky" : a.action === "DELETE" || a.action === "ESCALATE" ? "rose" : "emerald"}>{a.action}</Badge>
              <span className="font-medium text-ink">{a.actorName}</span>
              <span className="font-mono text-xs text-ink-3">{a.entityId === "*" ? "list" : `#${a.entityId.slice(0, 8)}`}</span>
              {a.detail && <span className="line-clamp-1 max-w-md text-xs text-ink-2">{a.detail}</span>}
              <span className="ml-auto text-xs text-ink-3">{new Date(a.createdAt).toLocaleString("en-IN")}</span>
            </li>
          ))}
          {audit?.length === 0 && <li className="py-4 text-center text-ink-3">No audit entries.</li>}
        </ul>
      </Modal>
    </div>
  );
}
