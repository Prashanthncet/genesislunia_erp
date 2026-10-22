"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE_LABEL, hasRole, useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Input, MailLink, Modal, PhoneLink, Select, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { errMsg, inr, slipTone, type Payslip, type StaffRow } from "./types";

type Profile = StaffRow & {
  leaves: { id: string; leaveType: string; startDate: string; endDate: string; status: string }[];
  salaryStructure?: { basicSalary: number; hra: number; da: number; tdsPercent: number; epfPercent: number } | null;
  payslips?: Payslip[];
};

const EMPTY_FORM = { name: "", email: "", role: "Teacher", department: "", phone: "", subjects: "", max_periods_per_day: "6" };

export function DirectoryPanel() {
  const { me } = useMe();
  const toast = useToast();
  const canAdmin = hasRole(me, R.STAFF_ADMIN);
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [filters, setFilters] = useState<{ roles: string[]; departments: string[] }>({ roles: [], departments: [] });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [loginRole, setLoginRole] = useState("");
  const [active, setActive] = useState("true");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM & { id?: string }>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [login, setLogin] = useState<{ staff: StaffRow; email: string; password: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...(dept ? { department: dept } : {}), ...(loginRole ? { login_role: loginRole } : {}), ...(active ? { active } : {}) });
    try {
      setRows(await apiFetch<StaffRow[]>(`/api/staff?${qs}`));
    } catch (e) {
      toast.push(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [q, role, dept, loginRole, active, toast]);

  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { apiFetch<typeof filters>("/api/staff/filters").then(setFilters).catch(() => undefined); }, []);

  const openProfile = async (id: string) => {
    try { setProfile(await apiFetch<Profile>(`/api/staff/${id}`)); } catch (e) { toast.push(errMsg(e), "error"); }
  };

  const edit = (s: StaffRow) => {
    setForm({ id: s.id, name: s.name, email: s.email, role: s.role, department: s.department ?? "", phone: s.phone ?? "", subjects: s.subjects ?? "", max_periods_per_day: String(s.maxPeriodsPerDay) });
    setFormOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { name: form.name, email: form.email, role: form.role, department: form.department, phone: form.phone, subjects: form.subjects, max_periods_per_day: Number(form.max_periods_per_day) };
      if (form.id) await apiFetch(`/api/staff/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await apiFetch("/api/staff", { method: "POST", body: JSON.stringify({ ...body, phone: form.phone || undefined, department: form.department || undefined }) });
      toast.push(form.id ? "Profile updated" : "Staff member added", "success");
      setFormOpen(false);
      setProfile(null);
      await load();
    } catch (e) {
      toast.push(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (s: StaffRow) => {
    if (!confirm(`Deactivate ${s.name}? Staff with history are kept but marked inactive.`)) return;
    try {
      const r = await apiFetch<{ deactivated: boolean }>(`/api/staff/${s.id}`, { method: "DELETE" });
      toast.push(r.deactivated ? "Deactivated" : "Removed", "success");
      setProfile(null);
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); }
  };

  const createLogin = async () => {
    if (!login) return;
    setBusy(true);
    try {
      await apiFetch("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({ email: login.email, password: login.password, role: login.role, name: login.staff.name, staff_id: login.staff.id }),
      });
      toast.push("Login created — they must change the password at first sign-in", "success");
      setLogin(null);
      setProfile(null);
      await load();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  const grantable = useMemo(() => R.STAFF.filter((r) => r !== "admin" && !(me?.role === "hr" && (R.ADMINS as readonly string[]).includes(r)) && !(r === "super_admin" && me?.role !== "super_admin")), [me]);

  return (
    <Card className="p-4">
      <CardHead
        title="Staff directory"
        icon="staff"
        subtitle={`${rows.length} staff`}
        actions={canAdmin && <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setFormOpen(true); }}>Add staff</Button>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Search name, email, phone" value={q} onChange={(e) => setQ(e.target.value)} className="field flex-1" />
        <Select aria-label="Designation" className="field w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All designations</option>
          {filters.roles.map((r) => <option key={r}>{r}</option>)}
        </Select>
        <Select aria-label="Department" className="field w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {filters.departments.map((d) => <option key={d}>{d}</option>)}
        </Select>
        <Select aria-label="Login role" className="field w-auto" value={loginRole} onChange={(e) => setLoginRole(e.target.value)}>
          <option value="">Any login role</option>
          {R.STAFF.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
        </Select>
        <Select aria-label="Status" className="field w-auto" value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </Select>
      </div>
      {loading ? <p className="py-6 text-center text-sm text-ink-3">Loading…</p> : rows.length === 0 ? <EmptyState title="No staff match" icon="staff" /> : (
        <TableView id="staff-directory">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Designation</th><th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Contact</th><th className="px-3 py-2 text-left">Login</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{s.name}</td>
                  <td className="px-3 py-2">{s.role}</td>
                  <td className="px-3 py-2">{s.department ?? "—"}</td>
                  <td className="px-3 py-2 text-xs"><MailLink value={s.email} /><br /><PhoneLink value={s.phone} /></td>
                  <td className="px-3 py-2">{s.user ? <Badge tone="brand">{ROLE_LABEL[s.user.role] ?? s.user.role}</Badge> : <span className="text-xs text-ink-3">No login</span>}</td>
                  <td className="px-3 py-2"><Badge tone={s.isActive ? "emerald" : "slate"}>{s.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" onClick={() => openProfile(s.id)}>Profile</Button>
                      {canAdmin && <Button size="sm" onClick={() => edit(s)}>Edit</Button>}
                      {canAdmin && !s.user && <Button size="sm" variant="accent" onClick={() => setLogin({ staff: s, email: s.email, password: "", role: "teacher" })}>Create login</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      )}

      <Modal open={!!profile} onClose={() => setProfile(null)} size="lg" title={profile?.name ?? ""} subtitle={profile ? `${profile.role} · ${profile.department ?? "No department"}` : ""}
        footer={profile && canAdmin && (
          <>
            {profile.isActive && <Button variant="danger" onClick={() => deactivate(profile)}>Deactivate</Button>}
            {!profile.user && <Button variant="accent" onClick={() => setLogin({ staff: profile, email: profile.email, password: "", role: "teacher" })}>Create login</Button>}
            <Button variant="primary" onClick={() => edit(profile)}>Edit profile</Button>
          </>
        )}>
        {profile && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><dt className="text-xs text-ink-3">Email</dt><dd><MailLink value={profile.email} /></dd></div>
              <div><dt className="text-xs text-ink-3">Phone</dt><dd><PhoneLink value={profile.phone} /></dd></div>
              <div><dt className="text-xs text-ink-3">Subjects</dt><dd>{profile.subjects ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-3">Max periods / day</dt><dd className="tnum">{profile.maxPeriodsPerDay}</dd></div>
              <div><dt className="text-xs text-ink-3">Login</dt><dd>{profile.user ? `${profile.user.email} (${ROLE_LABEL[profile.user.role] ?? profile.user.role})` : "None"}</dd></div>
              {profile.salaryStructure && <div><dt className="text-xs text-ink-3">Basic / HRA / DA</dt><dd className="tnum">{inr(profile.salaryStructure.basicSalary)} / {inr(profile.salaryStructure.hra)} / {inr(profile.salaryStructure.da)}</dd></div>}
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-ink-3">Recent leave</p>
              {profile.leaves.length ? (
                <ul className="space-y-1">{profile.leaves.map((l) => <li key={l.id} className="flex justify-between rounded-lg bg-surface-2/70 px-3 py-1.5"><span>{l.leaveType} · {l.startDate} → {l.endDate}</span><Badge tone={l.status === "Approved" ? "emerald" : l.status === "Rejected" ? "rose" : "amber"}>{l.status}</Badge></li>)}</ul>
              ) : <p className="text-ink-3">No leave on record.</p>}
            </div>
            {profile.payslips && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-ink-3">Payslips</p>
                <ul className="space-y-1">{profile.payslips.map((p) => <li key={p.id} className="flex justify-between rounded-lg bg-surface-2/70 px-3 py-1.5"><span className="tnum">{p.monthYear} · {inr(p.netSalary)}</span><Badge tone={slipTone(p.status)}>{p.status}</Badge></li>)}</ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? "Edit staff profile" : "Add staff member"}
        footer={<Button variant="primary" loading={busy} disabled={!form.name.trim() || !form.email.trim()} onClick={save}>Save</Button>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Designation"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} list="staff-designations" /></Field>
          <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} list="staff-departments" /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Max periods per day"><Input type="number" min={0} max={12} value={form.max_periods_per_day} onChange={(e) => setForm({ ...form, max_periods_per_day: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Subjects"><Input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} /></Field></div>
        </div>
        <datalist id="staff-designations">{filters.roles.map((r) => <option key={r} value={r} />)}</datalist>
        <datalist id="staff-departments">{filters.departments.map((d) => <option key={d} value={d} />)}</datalist>
      </Modal>

      <Modal open={!!login} onClose={() => setLogin(null)} size="sm" title="Create login" subtitle={login?.staff.name}
        footer={<Button variant="primary" loading={busy} disabled={!login?.email || (login?.password.length ?? 0) < 8} onClick={createLogin}>Create login</Button>}>
        {login && (
          <div className="space-y-3">
            <Field label="Login email"><Input type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></Field>
            <Field label="Temporary password" hint="8+ characters with upper, lower case and a number. They must change it at first sign-in.">
              <Input type="text" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
            </Field>
            <Field label="Role" hint={me?.role === "hr" ? "HR cannot grant administrator roles." : undefined}>
              <Select value={login.role} onChange={(e) => setLogin({ ...login, role: e.target.value })}>
                {grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}
