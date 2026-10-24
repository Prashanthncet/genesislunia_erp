"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE_LABEL, hasRole, useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, MailLink, Modal, PhoneLink, Select, SkeletonRows, useToast } from "@/components/ui";
import { CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Chip, Monogram, RecordCard, StatusPill, initials, toneFor } from "@/components/RecordCard";
import { TableView } from "@/components/TableView";
import { confirmAction } from "@/components/confirm";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { MAvatar, MCard, MChip, MCopyRow, MPanel } from "@/components/mobile/MobileCard";
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
    if (form.id && !(await confirmAction({ title: `Save changes to ${form.name || "this staff member"}?`, text: "Their staff profile will be updated.", confirmText: "Save changes", tone: "primary" }))) return;
    setBusy(true);
    try {
      const body = { name: form.name, email: form.email, role: form.role, department: form.department, phone: form.phone, subjects: form.subjects, max_periods_per_day: Number(form.max_periods_per_day) };
      if (form.id) await apiFetch(`/api/staff/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await apiFetch("/api/staff", { method: "POST", body: JSON.stringify({ ...body, phone: form.phone || undefined, department: form.department || undefined }) });
      toast.push(form.id ? `Profile updated for ${form.name}` : `${form.name} added to staff`, "success");
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
    if (!(await confirmAction({ title: `Deactivate ${s.name}?`, text: "Staff with history are kept but marked inactive; others are removed.", confirmText: "Deactivate", tone: "danger" }))) return;
    try {
      const r = await apiFetch<{ deactivated: boolean }>(`/api/staff/${s.id}`, { method: "DELETE" });
      toast.push(r.deactivated ? `${s.name} deactivated` : `${s.name} removed`, "success");
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

  const filtered = !!(q || role || dept || loginRole || active !== "true");
  const clearFilters = () => { setQ(""); setRole(""); setDept(""); setLoginRole(""); setActive("true"); };

  const rowActions = (s: StaffRow) => (
    <>
      <Button type="button" size="sm" onClick={() => openProfile(s.id)} aria-label={`Profile of ${s.name}`}>Profile</Button>
      {canAdmin && <Button type="button" size="sm" onClick={() => edit(s)} aria-label={`Edit ${s.name}`}>Edit</Button>}
      {canAdmin && !s.user && <Button type="button" size="sm" variant="accent" onClick={() => setLogin({ staff: s, email: s.email, password: "", role: "teacher" })}>Create login</Button>}
    </>
  );

  const directoryCards = (
    <CardGrid min="18rem" empty={<CardEmpty title="No staff match" hint="Try a different search or clear the filters." icon="staff" />}>
      {rows.map((s) => (
        <RecordCard key={s.id} rail={s.isActive ? undefined : "slate"}>
          <CardBody>
            <CardTitle
              lead={<Monogram text={initials(s.name)} tone={toneFor(s.department)} shape="circle" />}
              title={s.name}
              subtitle={`${s.role}${s.department ? ` · ${s.department}` : ""}`}
              aside={<StatusPill status={s.isActive ? "Active" : "Inactive"} />}
            />
            <div className="space-y-1 text-[12.5px]">
              <MailLink value={s.email} className="max-md:break-all" />
              {s.phone && <div><PhoneLink value={s.phone} /></div>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.user ? <Chip icon="lock" tone="navy">{ROLE_LABEL[s.user.role] ?? s.user.role}</Chip> : <Chip icon="lock">No login</Chip>}
              {s.subjects && <Chip icon="book">{s.subjects}</Chip>}
            </div>
          </CardBody>
          <CardFooter>{rowActions(s)}</CardFooter>
        </RecordCard>
      ))}
    </CardGrid>
  );

  /** Phones: staff card (avatar + status, contact panel, role/subject chips, Profile + Edit). */
  const mobileCards = rows.length === 0 ? (
    <CardEmpty title="No staff match" hint="Try a different search or clear the filters." icon="staff" />
  ) : rows.map((s) => {
    const tone = toneFor(s.department);
    return (
      <MCard key={s.id} tone={tone}>
        <div className="flex items-start gap-3.5">
          <MAvatar name={s.name} tone={tone} size={60} variant="soft" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[18px] font-bold leading-snug text-ink">{s.name}</p>
            <p className="mt-0.5 text-[13px] text-ink-3">{s.role}{s.department ? ` · ${s.department}` : ""}</p>
            <div className="mt-2"><StatusPill status={s.isActive ? "Active" : "Inactive"} /></div>
          </div>
        </div>
        <div className="mt-3.5">
          <MPanel>
            <div className="divide-y divide-line">
              <MCopyRow icon="mail" value={s.email} href={`mailto:${s.email}`} />
              {s.phone && <MCopyRow icon="phone" value={s.phone} href={`tel:${s.phone}`} />}
            </div>
          </MPanel>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <MChip icon="building" tone="blue">{s.role}</MChip>
          {s.subjects && <MChip icon="book">{s.subjects}</MChip>}
          {s.user
            ? <MChip icon="lock">{ROLE_LABEL[s.user.role] ?? s.user.role}</MChip>
            : <MChip icon="lock" tone="warn">No login</MChip>}
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => openProfile(s.id)} className="!min-h-12">
            <Icon name="eye" className="h-4 w-4" /> Profile
          </Button>
          {canAdmin && (
            <Button variant="primary" onClick={() => edit(s)} className="!min-h-12">
              <Icon name="edit" className="h-4 w-4" /> Edit
            </Button>
          )}
          {canAdmin && !s.user && (
            <Button variant="accent" onClick={() => setLogin({ staff: s, email: s.email, password: "", role: "teacher" })} className="col-span-2 !min-h-12">
              <Icon name="key" className="h-4 w-4" /> Create login
            </Button>
          )}
        </div>
      </MCard>
    );
  });

  return (
    <Card className="p-4">
      <CardHead
        title="Staff directory"
        icon="staff"
        subtitle={loading ? "Loading…" : `${rows.length} staff${filtered ? " (filtered)" : ""}`}
        actions={canAdmin && <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setFormOpen(true); }}>Add staff</Button>}
      />
      <div className="mb-3 flex flex-wrap items-end gap-2" role="search">
        <Input aria-label="Search staff" placeholder="Search name, email, phone" value={q} onChange={(e) => setQ(e.target.value)} className="field min-w-[12rem] flex-1" />
        <MobileFilters active={[role, dept, loginRole].filter(Boolean).length + (active !== "true" ? 1 : 0)}>
        <Select aria-label="Designation" className="field w-full sm:w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All designations</option>
          {filters.roles.map((r) => <option key={r}>{r}</option>)}
        </Select>
        <Select aria-label="Department" className="field w-full sm:w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {filters.departments.map((d) => <option key={d}>{d}</option>)}
        </Select>
        <Select aria-label="Login role" className="field w-full sm:w-auto" value={loginRole} onChange={(e) => setLoginRole(e.target.value)}>
          <option value="">Any login role</option>
          {R.STAFF.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
        </Select>
        <Select aria-label="Status" className="field w-full sm:w-auto" value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </Select>
        </MobileFilters>
        {filtered && <Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button>}
      </div>
      <TableView id="staff-directory" cards={loading ? undefined : directoryCards} mobileCards={loading ? undefined : mobileCards}>
        <div className="table-wrap max-h-[70vh] rounded-xl border border-line">
          <table className="data-table min-w-[52rem]">
            <thead>
              <tr>
                <th>Name</th><th>Designation</th><th>Department</th>
                <th>Contact</th><th>Login</th><th>Status</th><th className="th-end">Actions</th>
              </tr>
            </thead>
            {loading ? <SkeletonRows rows={6} cols={7} /> : (
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Monogram text={initials(s.name)} tone={toneFor(s.department)} size="sm" shape="circle" />
                        <span className="font-semibold text-ink">{s.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{s.role}</td>
                    <td className="whitespace-nowrap">{s.department ?? "—"}</td>
                    <td className="text-xs"><MailLink value={s.email} /><br /><PhoneLink value={s.phone} /></td>
                    <td>{s.user ? <Badge tone="brand">{ROLE_LABEL[s.user.role] ?? s.user.role}</Badge> : <span className="text-xs text-ink-3">No login</span>}</td>
                    <td><StatusPill status={s.isActive ? "Active" : "Inactive"} /></td>
                    <td className="td-end">
                      <div className="flex justify-end gap-1 whitespace-nowrap">{rowActions(s)}</div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7}><EmptyState title="No staff match" hint="Try a different search or clear the filters." icon="staff" /></td></tr>
                )}
              </tbody>
            )}
          </table>
        </div>
      </TableView>

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
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-md:[&_dd]:[overflow-wrap:anywhere]">
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
                <ul className="space-y-1">{profile.leaves.map((l) => <li key={l.id} className="flex justify-between rounded-lg bg-surface-2/70 px-3 py-1.5 max-md:items-start max-md:gap-2"><span>{l.leaveType} · {l.startDate} → {l.endDate}</span><Badge tone={l.status === "Approved" ? "emerald" : l.status === "Rejected" ? "rose" : "amber"}>{l.status}</Badge></li>)}</ul>
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
