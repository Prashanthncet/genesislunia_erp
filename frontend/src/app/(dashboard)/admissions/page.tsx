"use client";

/**
 * Admissions workflow screen — role-based queues with redesigned tabbed menu,
 * comprehensive filter options (status, payment status, academic year, class, house, search),
 * client-side QR code modal/download, and Google Forms-style form builder.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE, hasRole, useMe } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, Icon, Input, MailLink, Modal, PageHeader, PhoneLink, Reveal, Select, SkeletonRows, StatCard, Tabs, useToast } from "@/components/ui";
import { downloadQrPng, makeQrDataUrl } from "@/lib/qr";
import { QrScannerModal } from "@/components/QrScannerModal";
import { Application, PIPELINE, STATUS_TONE, fmtDate, inr, post } from "@/components/admissions/shared";
import { ApplicationPanel } from "@/components/admissions/ApplicationPanel";
import { CreateForms } from "@/components/admissions/CreateForms";
import { TemplateApprovals, TemplateBuilder } from "@/components/admissions/TemplateBuilder";

type Tab = "applications" | "create" | "template" | "approvals";

const ROLE_QUEUE: Record<string, string[]> = {
  [ROLE.ADMISSION_OFFICER]: ["Submitted by Parent", "Re-submit", "Link Expired"],
  [ROLE.ACCOUNTS]: ["Document Validated", "Payment Received"],
  [ROLE.OFFICE_SUPERINTENDENT]: ["Fee Approved"],
  [ROLE.VICE_PRINCIPAL]: ["Roll No Assigned"],
  [ROLE.PRINCIPAL]: ["VP Approved"],
};

export default function AdmissionsPage() {
  const { me } = useMe();
  const { push: notify } = useToast();
  const [tab, setTab] = useState<Tab>("applications");
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [qrApp, setQrApp] = useState<{ app: Application; url: string; qrDataUrl: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Comprehensive Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [houseFilter, setHouseFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "name" | "status">("updated");
  const [search, setSearch] = useState("");

  const canSetup = hasRole(me, R.ADMISSION_SETUP);
  const canOs = hasRole(me, R.ADMISSION_OS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<Application[] | { data: Application[] }>("/api/admissions");
      setApps(Array.isArray(list) ? list : list.data ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load applications", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const myQueue = useMemo(() => (me ? ROLE_QUEUE[me.role] ?? [] : []), [me]);
  const myQueueCount = useMemo(() => apps.filter((a) => myQueue.includes(a.status)).length, [apps, myQueue]);

  const distinctYears = useMemo(
    () => Array.from(new Set(apps.map((a) => a.academicYear).filter((x): x is string => Boolean(x)))).sort().reverse(),
    [apps],
  );
  const distinctClasses = useMemo(
    () =>
      Array.from(
        new Map(
          apps
            .filter((a) => a.class)
            .map((a) => [a.class!.id, `${a.class!.name}${a.class!.section ? `-${a.class!.section}` : ""}`]),
        ).entries(),
      ),
    [apps],
  );
  const distinctHouses = useMemo(
    () => Array.from(new Set(apps.map((a) => a.house).filter((x): x is string => Boolean(x)))).sort(),
    [apps],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = apps.filter((a) => {
      if (statusFilter === "__mine__" && !myQueue.includes(a.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "__mine__" && a.status !== statusFilter) return false;
      if (paymentFilter !== "all" && a.paymentStatus !== paymentFilter) return false;
      if (yearFilter !== "all" && a.academicYear !== yearFilter) return false;
      if (classFilter !== "all" && a.classId !== classFilter && a.class?.id !== classFilter) return false;
      if (houseFilter !== "all" && a.house !== houseFilter) return false;
      if (!q) return true;
      return [a.studentName, a.parentName, a.parentEmail, a.parentContact, a.loginId, a.rollNo, a.receiptNo]
        .some((v) => v?.toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      if (sortBy === "name") return (a.studentName ?? a.parentName ?? "").localeCompare(b.studentName ?? b.parentName ?? "");
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
  }, [apps, statusFilter, paymentFilter, yearFilter, classFilter, houseFilter, sortBy, search, myQueue]);

  const hasActiveFilters =
    statusFilter !== "all" || paymentFilter !== "all" || yearFilter !== "all" || classFilter !== "all" || houseFilter !== "all" || Boolean(search.trim());

  const resetFilters = () => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setYearFilter("all");
    setClassFilter("all");
    setHouseFilter("all");
    setSearch("");
  };

  const runReminders = async () => {
    setReminding(true);
    try {
      const r = await post<{ reminded: number; expired: number }>("/api/admissions/reminders/run");
      notify(`Reminders sent: ${r.reminded} · Expired: ${r.expired}`);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Reminder job failed", "error");
    } finally {
      setReminding(false);
    }
  };

  const openQrForRow = async (app: Application, e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    let targetUrl = `${origin}/portal/admission?app=${encodeURIComponent(app.id)}`;
    let qrDataUrl = "";
    try {
      const detail = await apiFetch<{ form_link?: string | null; qr_data_url?: string | null }>(`/api/admissions/${app.id}`);
      if (detail.form_link) targetUrl = detail.form_link;
      if (detail.qr_data_url) qrDataUrl = detail.qr_data_url;
    } catch {
      // Fallback to client-side generated QR
    }
    if (!qrDataUrl) qrDataUrl = makeQrDataUrl(targetUrl, 280);
    setQrApp({ app, url: targetUrl, qrDataUrl });
  };

  const tabs: { id: Tab; label: string; count?: number; icon: string }[] = [
    { id: "applications", label: "Applications", count: apps.length, icon: "admissions" },
    ...(canSetup ? [{ id: "create" as const, label: "Create Forms & QR", icon: "qr" }] : []),
    ...(canSetup ? [{ id: "template" as const, label: "Form Builder", icon: "layers" }] : []),
    ...(canOs ? [{ id: "approvals" as const, label: "Template Approvals", icon: "checkCircle" }] : []),
  ];

  const counts = {
    total: apps.length,
    waiting: myQueueCount,
    inFlight: apps.filter((a) => !["Admission Complete", "Rejected"].includes(a.status)).length,
    complete: apps.filter((a) => a.status === "Admission Complete").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="admissions"
        title="Admissions"
        subtitle="Google Forms-style template builder, parent QR links, document verification, fee approval, roll/house allotment, and Principal digital sign-off."
        actions={
          canSetup && (
            <>
              <Button variant="soft" loading={reminding} onClick={runReminders}>
                <Icon name="clock" className="h-4 w-4" /> Run 2-day reminders
              </Button>
              <Button variant="primary" onClick={() => setTab("create")}>
                <Icon name="qr" className="h-4 w-4" /> Create admission form &amp; QR
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-2.5">
        <StatCard label="Total applications" value={counts.total} icon="admissions" tone="brand" />
        <StatCard label="Waiting on your role" value={counts.waiting} icon="bell" tone="amber" delay={50} />
        <StatCard label="In workflow" value={counts.inFlight} icon="activity" tone="sky" delay={100} />
        <StatCard label="Admissions complete" value={counts.complete} icon="check" tone="emerald" delay={150} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === "create" && canSetup && <CreateForms notify={notify} onCreated={() => { void load(); setTab("applications"); }} />}
      {tab === "template" && canSetup && <TemplateBuilder notify={notify} />}
      {tab === "approvals" && canOs && <TemplateApprovals notify={notify} onChanged={load} />}

      {tab === "applications" && (
        <Reveal>
          <Card>
            {/* Comprehensive Filter Bar */}
            <div className="space-y-3 border-b border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="relative min-w-[15rem] flex-1">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                  <Input
                    placeholder="Search student, parent, login ID, roll no, phone, email, receipt…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="soft" onClick={() => setShowScanner(true)}>
                    <Icon name="qr" className="h-3.5 w-3.5" /> Scan Form QR
                  </Button>
                  {myQueue.length > 0 && (
                    <Button
                      size="sm"
                      variant={statusFilter === "__mine__" ? "primary" : "soft"}
                      onClick={() => setStatusFilter(statusFilter === "__mine__" ? "all" : "__mine__")}
                    >
                      <Icon name="filter" className="h-3.5 w-3.5" /> My queue ({myQueueCount})
                    </Button>
                  )}
                  {hasActiveFilters && (
                    <Button size="sm" variant="ghost" onClick={resetFilters}>
                      <Icon name="x" className="h-3.5 w-3.5" /> Clear filters
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Status: All ({apps.length})</option>
                  {myQueue.length > 0 && <option value="__mine__">Waiting on me ({myQueueCount})</option>}
                  {[...PIPELINE, "Re-submit", "Link Expired", "Rejected"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>

                <Select aria-label="Filter by payment status" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                  <option value="all">Payment: All</option>
                  <option value="Pending">Payment: Pending</option>
                  <option value="Paid">Payment: Paid</option>
                  <option value="Verified">Payment: Verified</option>
                </Select>

                <Select aria-label="Filter by academic year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                  <option value="all">Year: All</option>
                  {distinctYears.map((y) => <option key={y} value={y}>Year: {y}</option>)}
                </Select>

                <Select aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                  <option value="all">Class: All</option>
                  {distinctClasses.map(([id, label]) => <option key={id} value={id}>Class: {label}</option>)}
                </Select>

                <Select aria-label="Filter by house" value={houseFilter} onChange={(e) => setHouseFilter(e.target.value)}>
                  <option value="all">House: All</option>
                  {distinctHouses.map((h) => <option key={h} value={h}>House: {h}</option>)}
                </Select>

                <Select aria-label="Sort order" value={sortBy} onChange={(e) => setSortBy(e.target.value as "updated" | "name" | "status")}>
                  <option value="updated">Sort: Recently updated</option>
                  <option value="name">Sort: Name (A–Z)</option>
                  <option value="status">Sort: Workflow status</option>
                </Select>
              </div>

              <div className="flex items-center justify-between text-[12px] text-ink-3">
                <span>Showing <b>{filtered.length}</b> of <b>{apps.length}</b> admission applications</span>
                <span>Click any row to inspect responses, documents, QR code, and workflow actions</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Applicant</th>
                    <th className="px-4 py-2.5 max-md:hidden">Parent</th>
                    <th className="px-4 py-2.5 max-md:hidden">Year / Class</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 max-md:hidden">Payment</th>
                    <th className="px-4 py-2.5 max-md:hidden">Roll / House</th>
                    <th className="px-4 py-2.5 text-right max-md:hidden">QR / Updated</th>
                  </tr>
                </thead>
                {loading ? (
                  <SkeletonRows rows={5} cols={7} />
                ) : filtered.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon="admissions"
                          title="No applications match these filters"
                          hint={canSetup ? "Clear your filters or use 'Create Forms & QR' to send a form link to a parent." : "Applications appear here as they move through the workflow."}
                          action={hasActiveFilters ? <Button variant="soft" onClick={resetFilters}>Reset filters</Button> : undefined}
                        />
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <tbody>
                    {filtered.map((a) => (
                      <tr
                        key={a.id}
                        onClick={() => setSelected(a.id)}
                        className="cursor-pointer border-t border-line hover:bg-surface-2/60"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">{a.studentName ?? <span className="text-ink-3">Form not submitted yet</span>}</div>
                          <div className="font-mono text-xs text-ink-3">{a.loginId ?? a.id.slice(0, 8)}</div>
                          <div className="mt-0.5 text-xs text-ink-3 md:hidden">{a.parentName ?? "—"} · {fmtDate(a.updatedAt)}</div>
                        </td>
                        <td className="px-4 py-3 max-md:hidden" onClick={(e) => e.stopPropagation()}>
                          <div>{a.parentName ?? "—"}</div>
                          <div className="text-xs text-ink-3">
                            {a.parentContact ? <PhoneLink value={a.parentContact} /> : <MailLink value={a.parentEmail} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-2 max-md:hidden">
                          <div>{a.academicYear ?? "—"}</div>
                          <div className="text-ink-3">{a.class ? `${a.class.name}${a.class.section ? `-${a.class.section}` : ""}` : "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[a.status] ?? "slate"}>{a.status}</Badge>
                          {myQueue.includes(a.status) && <span className="ml-1.5 text-[11px] font-bold text-warn">• Action needed</span>}
                        </td>
                        <td className="px-4 py-3 text-xs max-md:hidden">
                          <div><Badge tone={a.paymentStatus === "Verified" ? "emerald" : a.paymentStatus === "Paid" ? "teal" : "amber"}>{a.paymentStatus}</Badge></div>
                          <div className="mt-0.5 text-ink-3">{inr(a.feeAmount)}</div>
                        </td>
                        <td className="px-4 py-3 text-xs max-md:hidden">
                          <div className="font-mono">{a.rollNo ?? "—"}</div>
                          <div className="text-ink-3">{a.house ? `${a.house} house` : "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-ink-3 max-md:hidden">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => void openQrForRow(a, e)}
                              title="View / Download Admission Form QR Code"
                              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
                            >
                              <Icon name="qr" className="h-3.5 w-3.5" /> QR
                            </button>
                            <span>{fmtDate(a.updatedAt)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </Card>
        </Reveal>
      )}

      {selected && (
        <ApplicationPanel
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
          notify={notify}
        />
      )}

      <QrScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        title="Scan Admission Form QR Code"
        subtitle="Scan a parent's admission form QR code, paste a form URL, or enter a login ID to jump directly to the application."
        onScan={(raw) => {
          const trimmed = raw.trim();
          const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          const tokenMatch = trimmed.match(/[?&]token=([^&#\s]+)/i);
          const appById = uuidMatch ? apps.find((a) => a.id.toLowerCase() === uuidMatch[0].toLowerCase()) : null;
          const appByLogin = apps.find((a) => (a.loginId ?? "").toLowerCase() === trimmed.toLowerCase());
          if (appById) {
            setSelected(appById.id);
            notify(`Opened application for ${appById.studentName ?? appById.parentName ?? appById.loginId ?? appById.id.slice(0, 8)}`);
            return;
          }
          if (appByLogin) {
            setSelected(appByLogin.id);
            notify(`Opened application for ${appByLogin.studentName ?? appByLogin.loginId}`);
            return;
          }
          if (tokenMatch?.[1]) {
            window.open(`/admission-form?token=${encodeURIComponent(tokenMatch[1])}`, "_blank", "noopener,noreferrer");
            notify("Opened scanned public admission form");
            return;
          }
          setSearch(trimmed);
          notify(`Filtered applications by "${trimmed}"`);
        }}
      />

      {qrApp && (
        <Modal
          open
          onClose={() => setQrApp(null)}
          title={`Admission Form QR — ${qrApp.app.studentName ?? qrApp.app.parentName ?? qrApp.app.loginId ?? "Application"}`}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setQrApp(null)}>Close</Button>
              <Button variant="soft" onClick={() => void navigator.clipboard?.writeText(qrApp.url).then(() => notify("Form link copied"))}>
                <Icon name="copy" className="h-4 w-4" /> Copy Link
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  downloadQrPng(qrApp.url, `admission-qr-${qrApp.app.loginId ?? qrApp.app.id.slice(0, 8)}.png`, qrApp.qrDataUrl);
                  notify("QR code PNG downloaded");
                }}
              >
                <Icon name="download" className="h-4 w-4" /> Download QR PNG
              </Button>
            </>
          }
        >
          <div className="flex flex-col items-center space-y-3 py-2 text-center">
            {qrApp.qrDataUrl && (
              <div className="rounded-2xl border-2 border-brand-100 bg-white p-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrApp.qrDataUrl} alt="Admission Form QR" className="h-56 w-56" />
              </div>
            )}
            <p className="text-xs text-ink-2">
              Parent: <b>{qrApp.app.parentName ?? "—"}</b> · Login ID: <code className="font-mono font-bold">{qrApp.app.loginId ?? "—"}</code>
            </p>
            <p className="text-[11.5px] text-brand-700 break-all">{qrApp.url}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
