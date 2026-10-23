"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { R, ROLE, ROLE_LABEL, useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, IconButton, Input, Modal, Select, SkeletonRows, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  staffId: string | null;
  studentId: string | null;
  createdAt: string;
  staff: { name: string; role: string } | null;
  student: { fullName: string } | null;
  parentLinks: { student: { id: string; fullName: string } }[];
};

type StaffOpt = { id: string; name: string; role: string; user?: { id: string } | null };
type StudentOpt = { id: string; fullName: string; admissionNo: string; class: { name: string; section: string | null } | null };

const ALL_ROLES = Object.values(ROLE).filter((r) => r !== ROLE.ADMIN);
const ADMINS = R.ADMINS as readonly string[];

/** Same rule as the backend DTO: 8–72 chars, upper + lower + digit. */
const strongEnough = (p: string) => p.length >= 8 && p.length <= 72 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);

function tempPassword(): string {
  const words = ["Maple", "River", "Cedar", "Falcon", "Harbor", "Summit", "Orchid", "Comet"];
  const rnd = new Uint32Array(2);
  crypto.getRandomValues(rnd);
  return `${words[rnd[0] % words.length]}@${1000 + (rnd[1] % 9000)}x`;
}

/** Roles the signed-in admin may grant (mirrors AuthController.assertCanGrant). */
function grantable(actor: string | undefined): string[] {
  return ALL_ROLES.filter((r) => {
    if (r === ROLE.SUPER_ADMIN && actor !== ROLE.SUPER_ADMIN) return false;
    if (actor === ROLE.HR && ADMINS.includes(r)) return false;
    return true;
  });
}

export function UserManagement() {
  const { me } = useMe();
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await apiFetch<UserRow[]>(`/api/auth/users${roleFilter ? `?role=${encodeURIComponent(roleFilter)}` : ""}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
      setRows([]);
    }
  }, [roleFilter]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows ?? [];
    return (rows ?? []).filter((u) =>
      [u.email, u.name, u.staff?.name, u.student?.fullName, ...u.parentLinks.map((l) => l.student.fullName)]
        .some((v) => v?.toLowerCase().includes(term)));
  }, [rows, q]);

  const roles = grantable(me?.role);
  const canTouch = (u: UserRow) => u.id !== me?.id && (u.role !== ROLE.SUPER_ADMIN || me?.role === ROLE.SUPER_ADMIN)
    && !(me?.role === ROLE.HR && ADMINS.includes(u.role));

  const toggleActive = async (u: UserRow) => {
    try {
      await apiFetch(`/api/auth/users/${u.id}`, { method: "PUT", body: JSON.stringify({ is_active: !u.isActive }) });
      toast.push(u.isActive ? `${u.email} disabled — signed out on the next request` : `${u.email} re-enabled`);
      void load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <Card>
      <CardHead
        icon="key"
        title="User management"
        subtitle="Logins for staff, parents and students. New and reset accounts must change their password at first sign-in."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" className="h-4 w-4" />
            New user
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
        <Input className="field flex-1" placeholder="Search name, email or child…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <Select className="field w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
        </Select>
      </div>
      {error && <p className="px-5 py-3 text-[13px] text-danger">{error}</p>}
      {rows && shown.length === 0 && !error ? (
        <EmptyState icon="user" title="No users match" />
      ) : (
        <TableView id="settings-users" title="User">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="table-head">
                <th className="px-5 py-2.5 text-left">User</th>
                <th className="px-3 py-2.5 text-left">Role</th>
                <th className="px-3 py-2.5 text-left">Linked to</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            {!rows ? <SkeletonRows rows={6} cols={5} /> : (
              <tbody className="divide-y divide-line">
                {shown.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-ink">{u.name ?? u.staff?.name ?? u.student?.fullName ?? "—"}</p>
                      <p className="text-[12px] text-ink-3">{u.email}</p>
                    </td>
                    <td className="px-3 py-3"><Badge tone="brand">{ROLE_LABEL[u.role] ?? u.role}</Badge></td>
                    <td className="px-3 py-3 text-[12.5px] text-ink-2">
                      {u.staff ? `Staff: ${u.staff.name}` : u.student ? `Student: ${u.student.fullName}` : u.parentLinks.length
                        ? `Children: ${u.parentLinks.map((l) => l.student.fullName).join(", ")}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={u.isActive ? "emerald" : "rose"}>{u.isActive ? "Active" : "Disabled"}</Badge>
                        {u.mustChangePassword && <Badge tone="amber">Temp password</Badge>}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {canTouch(u) ? (
                        <span className="flex justify-end gap-1">
                          <IconButton name="edit" label={`Change role of ${u.email}`} variant="ghost" onClick={() => setEditing(u)} />
                          <IconButton name="key" label={`Reset password of ${u.email}`} variant="ghost" onClick={() => setResetting(u)} />
                          <Button size="sm" variant={u.isActive ? "danger" : "soft"} onClick={() => toggleActive(u)}>
                            {u.isActive ? "Disable" : "Enable"}
                          </Button>
                        </span>
                      ) : (
                        <span className="block text-right text-[11.5px] text-ink-3">{u.id === me?.id ? "You" : "Protected"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </TableView>
      )}

      {creating && <CreateUserModal roles={roles} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load(); }} />}
      {editing && <EditRoleModal user={editing} roles={roles} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
      {resetting && <ResetModal user={resetting} onClose={() => setResetting(null)} onDone={() => { setResetting(null); void load(); }} />}
    </Card>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label="Temporary password"
      required
      hint="8+ characters with upper, lower and a number. Share it privately; they must change it at first sign-in."
      error={value && !strongEnough(value) ? "Too weak — needs 8+ chars, upper, lower and a number" : undefined}
    >
      <span className="flex gap-2">
        <Input className="field flex-1 font-mono" value={value} onChange={(e) => onChange(e.target.value)} maxLength={72} autoComplete="new-password" />
        <Button type="button" onClick={() => onChange(tempPassword())}>Generate</Button>
      </span>
    </Field>
  );
}

function CreateUserModal({ roles, onClose, onDone }: { roles: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(tempPassword);
  const [role, setRole] = useState<string>(ROLE.TEACHER);
  const [staffId, setStaffId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const [staff, setStaff] = useState<StaffOpt[] | null>(null);
  const [students, setStudents] = useState<StudentOpt[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [studentQ, setStudentQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isParent = role === ROLE.PARENT;
  const isStudent = role === ROLE.STUDENT;
  const isStaffRole = !isParent && !isStudent;

  useEffect(() => {
    if (isStaffRole && staff === null) {
      apiFetch<StaffOpt[]>("/api/staff").then(setStaff).catch(() => setStaff([]));
    }
    if (!isStaffRole && students === null) {
      apiFetch<{ data: StudentOpt[] }>("/api/students?page_size=200")
        .then((r) => setStudents(r.data ?? []))
        .catch((err) => { setStudents([]); setLookupError(err instanceof Error ? err.message : "Could not load students"); });
    }
  }, [isStaffRole, staff, students]);

  const filteredStudents = (students ?? []).filter((s) => {
    const t = studentQ.trim().toLowerCase();
    return !t || s.fullName.toLowerCase().includes(t) || s.admissionNo.toLowerCase().includes(t);
  }).slice(0, 60);

  const valid = /\S+@\S+\.\S+/.test(email) && strongEnough(password) && (!isStudent || studentId) && (!isParent || childIds.length > 0);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          role,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(isStaffRole && staffId ? { staff_id: staffId } : {}),
          ...(isStudent ? { student_id: studentId } : {}),
          ...(isParent ? { child_ids: childIds } : {}),
        }),
      });
      toast.push(`Login created for ${email}. Share the temporary password privately.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the user");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New user"
      subtitle="The account must change its password at first sign-in."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!valid}>
            <Icon name="check" className="h-4 w-4" />
            Create login
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger" role="alert">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field label="Role" required>
          <Select value={role} onChange={(e) => { setRole(e.target.value); setStudentId(""); setChildIds([]); setStaffId(""); }} aria-label="Role">
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
          </Select>
        </Field>
        <PasswordField value={password} onChange={setPassword} />

        {isStaffRole && (
          <Field label="Link to staff record" hint="Optional. Needed for payslips, timetable and 'my classes'.">
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Staff record">
              <option value="">— none —</option>
              {(staff ?? []).filter((s) => !s.user).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </Select>
          </Field>
        )}

        {!isStaffRole && (
          <div>
            <span className="label">{isParent ? "Children this parent may see" : "Student record"} <span className="text-danger">*</span></span>
            {lookupError ? (
              <p className="text-[12.5px] text-danger">Can&apos;t list students with your role ({lookupError}). Ask an administrator to create portal logins.</p>
            ) : (
              <>
                <Input placeholder="Search name or admission no." value={studentQ} onChange={(e) => setStudentQ(e.target.value)} aria-label="Search students" />
                <ul className="scroll-slim mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
                  {students === null && <li className="px-3 py-2 text-[12px] text-ink-3">Loading…</li>}
                  {filteredStudents.map((s) => {
                    const checked = isParent ? childIds.includes(s.id) : studentId === s.id;
                    return (
                      <li key={s.id} className="border-b border-line last:border-0">
                        <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[12.5px] hover:bg-surface-2">
                          <input
                            type={isParent ? "checkbox" : "radio"}
                            name="student-link"
                            checked={checked}
                            onChange={() => isParent
                              ? setChildIds((ids) => ids.includes(s.id) ? ids.filter((i) => i !== s.id) : ids.length >= 10 ? ids : [...ids, s.id])
                              : setStudentId(s.id)}
                          />
                          <span className="flex-1 truncate font-medium text-ink">{s.fullName}</span>
                          <span className="shrink-0 text-[11px] text-ink-3">
                            {s.admissionNo}{s.class ? ` · ${s.class.name}${s.class.section ? ` ${s.class.section}` : ""}` : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {isParent && <p className="mt-1 text-[11.5px] text-ink-3">{childIds.length} selected (max 10)</p>}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditRoleModal({ user, roles, onClose, onDone }: { user: UserRow; roles: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState(user.role);
  const [name, setName] = useState(user.name ?? "");
  const [saving, setSaving] = useState(false);
  const portalSwitch = (R.PORTAL as readonly string[]).includes(role) !== (R.PORTAL as readonly string[]).includes(user.role);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/auth/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...(role !== user.role ? { role } : {}), ...(name !== (user.name ?? "") ? { name } : {}) }),
      });
      toast.push("User updated — takes effect on their next request");
      onDone();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Update failed", "error");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit user"
      subtitle={user.email}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={portalSwitch}>Save</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
        <Field label="Role" error={portalSwitch ? "Switching between staff and parent/student logins needs a new account (different links)." : undefined}>
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            {(roles.includes(user.role) ? roles : [user.role, ...roles]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function ResetModal({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState(tempPassword);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/auth/users/${user.id}`, { method: "PUT", body: JSON.stringify({ password }) });
      toast.push(`Password reset for ${user.email}. They must change it at next sign-in.`);
      onDone();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Reset failed", "error");
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      subtitle={user.email}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={save} loading={saving} disabled={!strongEnough(password)}>Reset password</Button>
        </>
      }
    >
      <PasswordField value={password} onChange={setPassword} />
    </Modal>
  );
}
