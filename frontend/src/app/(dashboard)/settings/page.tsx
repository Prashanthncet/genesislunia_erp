"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDownload, apiFetch } from "@/lib/api";
import { R, ROLE, ROLE_LABEL, clearSession, hasRole, useMe } from "@/lib/auth";
import {
  Badge, Button, Card, CardHead, Icon, StatCard, useToast,
} from "@/components/ui";
import type { Notice } from "@/components/NotificationStackPopover";
import { UserManagement } from "./UserManagement";
import { confirmLogout } from "@/components/DashboardShell";

const ROLE_SCOPE: Record<string, string> = {
  super_admin: "Full access to every module in the school, including money and safeguarding records.",
  branch_admin: "Manages the whole school: admissions, fees, payroll, users and configuration.",
  admin: "Manages the whole school: admissions, fees, payroll, users and configuration.",
  principal: "Final admission approval, leave and gate-pass approvals, safeguarding, reports.",
  vice_principal: "Admission approval at the VP step, academics oversight, approvals, reports.",
  office_superintendent: "Admission template approval and roll numbers, student records, fee reading.",
  admission_officer: "Admission setup: form fields, parent links and document validation.",
  accounts: "Fee invoices, collections, receipts and admission payment verification.",
  hr: "Staff records, leave approvals, payroll and user logins (non-admin).",
  hod: "Department academics, timetable, lesson plans, attendance and leave approvals.",
  teacher: "Classroom access — attendance, marks, lesson plans, CBT and their own timetable.",
  warden: "Hostel rooms, beds and roll-call; Gate Desk (issue and approve passes, pass records); student list; visitors.",
  security: "Gate Desk only: verify passes, check students out and in, pass records and the visitor log.",
  discipline_officer: "Safeguarding case log, escalations and confidential notes.",
};

const MOTION_KEY = "motion_pref";

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();

  const [notices, setNotices] = useState<Notice[]>([]);
  const [reduced, setReduced] = useState(false);

  const canUsers = hasRole(me, R.USER_ADMIN);
  const canLog = hasRole(me, R.NOTIFICATION_LOG);
  const canExport = hasRole(me, R.REPORTS);

  useEffect(() => {
    if (canLog) {
      apiFetch<Notice[]>("/api/notifications")
        .then((rows) => setNotices(Array.isArray(rows) ? rows : []))
        .catch(() => setNotices([]));
    }
    let pref: string | null = null;
    try { pref = localStorage.getItem(MOTION_KEY); } catch { /* storage blocked */ }
    const next = pref === "reduced";
    setReduced(next);
    document.documentElement.dataset.motion = next ? "reduced" : "full";
  }, [canLog]);

  function toggleMotion(next: boolean) {
    setReduced(next);
    try { localStorage.setItem(MOTION_KEY, next ? "reduced" : "full"); } catch { /* storage blocked */ }
    document.documentElement.dataset.motion = next ? "reduced" : "full";
    toast.push(next ? "Motion reduced across the app" : "Full motion restored", "info");
  }

  async function signOut() {
    if (!(await confirmLogout())) return;
    clearSession();
    router.push("/login");
  }

  async function exportCsv(type: string) {
    try {
      await apiDownload(`/api/reports/export/${type}?format=csv`, `${type}.csv`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Export failed", "error");
    }
  }

  const role = me?.role ?? "";
  const roleLabel = ROLE_LABEL[role] ?? (role ? role.replace(/_/g, " ") : "—");

  const sent = notices.filter((n) => n.status === "sent").length;
  const failed = notices.filter((n) => n.status === "failed").length;
  const mocked = notices.filter((n) => n.status === "mocked").length;
  const channels = Array.from(new Set(notices.map((n) => n.channel)));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
            <Icon name="settings" />
          </span>
          <div>
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Account</p>
            <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-ink">Settings</h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
              {canUsers ? "User logins, this device and what this deployment can honestly change." : "Your access, this device and what this deployment can honestly change."}
            </p>
          </div>
        </div>
        <Button onClick={signOut} variant="danger">
          <Icon name="logout" className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      {canUsers && <UserManagement />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {/* ── Account ─────────────────────────────────────────────── */}
        <Card className="lg:col-span-2" delay={0}>
          <CardHead
            icon="user"
            title="Your access"
            subtitle={me?.email}
            actions={
              <Link href="/account" className="btn-soft">
                My account
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="label">Role</dt>
                <dd><Badge tone="brand">{roleLabel}</Badge></dd>
              </div>
              <div>
                <dt className="label">Session length</dt>
                <dd className="text-[13px] text-ink">8 hours, then re-authentication</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="label">What this role can do</dt>
                <dd className="text-[12.5px] leading-relaxed text-ink-2">
                  {ROLE_SCOPE[role] ?? "Permissions are enforced by the server on every request."}
                </dd>
              </div>
            </dl>
            <p className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-ink-2">
              <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              Roles are changed by a school administrator or HR. You can change your own password from
              <Link href="/account/password" className="mx-1 font-semibold text-accent-600 hover:underline">Change password</Link>.
            </p>
          </div>
        </Card>

        {/* ── Institution ─────────────────────────────────────────── */}
        <Card delay={60}>
          <CardHead icon="building" title="Institution" subtitle="This deployment" />
          <div className="space-y-3 p-5 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-3">School</span>
              <span className="font-semibold text-ink">{me?.branch_name ?? "…"}</span>
            </div>
            <div className="divider" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-3">Branch code</span>
              <span className="font-mono text-ink">{me?.branch_id ?? "…"}</span>
            </div>
            <div className="divider" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-3">Academic session</span>
              <span className="font-semibold text-ink">2026–27</span>
            </div>
            <div className="divider" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-3">Data scoping</span>
              <span className="font-semibold text-ink">Per school</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Notifications ─────────────────────────────────────────── */}
      {canLog && (
      <Card delay={120}>
        <CardHead
          icon="bell"
          title="Notification delivery"
          subtitle="Live counts from the outbound log — not a settings form, because dispatch is configured server-side."
          actions={
            <Link href="/notifications" className="btn-soft">
              Open the log
              <Icon name="chevronRight" className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
          <StatCard label="Delivered" value={sent} tone="emerald" icon="check" />
          <StatCard label="Failed" value={failed} tone={failed > 0 ? "rose" : "teal"} icon="alert" />
          <StatCard
            label="Recorded as mocked"
            value={mocked}
            tone={mocked > 0 ? "amber" : "teal"}
            icon="info"
            hint={mocked > 0 ? "No webhook configured" : undefined}
          />
          <StatCard label="Channels in use" value={channels.length} tone="sky" icon="activity" />
        </div>
        <div className="px-5 pb-5">
          <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-ink-2">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
            {mocked > 0
              ? "Some messages are marked “mocked”: no NOTIFY_WEBHOOK_URL is configured on the server, so they were recorded but never handed to a real gateway. Nothing here claims they reached a parent."
              : "Every message in the log was handed to a configured gateway. Delivery receipts are not stored, so “sent” means handed off, not confirmed received."}
          </p>
        </div>
      </Card>
      )}

      {/* ── Appearance & motion ──────────────────────────────────── */}
      <Card delay={180}>
        <CardHead icon="sparkles" title="Appearance & motion" subtitle="These apply instantly on this device." />
        <div className="divide-y divide-line">
          <label className="flex cursor-pointer items-center justify-between gap-4 p-5">
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">Reduce motion</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">
                Removes entrance animations, count-ups and slide transitions. Useful on shared
                machines, older hardware, or if motion is distracting. Your operating system
                preference is honoured automatically either way.
              </span>
            </span>
            <span className="relative shrink-0">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={reduced}
                onChange={(e) => toggleMotion(e.target.checked)}
              />
              <span className="block h-6 w-11 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-brand-600" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-200 peer-checked:translate-x-5" />
            </span>
          </label>

          <div className="flex items-start justify-between gap-4 p-5">
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">Print styles</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">
                Fee receipts and admission letters print without navigation, sidebars or buttons.
                Use your browser&apos;s Print option on those screens.
              </span>
            </span>
            <Badge tone="emerald">Active</Badge>
          </div>
        </div>
      </Card>

      {/* ── Exports ───────────────────────────────────────────────── */}
      {canExport && (
      <Card delay={240}>
        <CardHead icon="download" title="Data export" subtitle="School-scoped CSV downloads produced by the reports module." />
        <div className="flex flex-wrap gap-2 p-5">
          {[
            { type: "students", ok: hasRole(me, [...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT]) },
            { type: "fees", ok: hasRole(me, R.FEES_READ) },
            { type: "defaulters", ok: hasRole(me, R.FEES_READ) },
            { type: "attendance", ok: true },
          ].filter((x) => x.ok).map(({ type }) => (
            <button key={type} type="button" onClick={() => exportCsv(type)} className="btn-soft capitalize">
              <Icon name="download" className="h-4 w-4" />
              {type} CSV
            </button>
          ))}
        </div>
      </Card>
      )}
    </div>
  );
}
