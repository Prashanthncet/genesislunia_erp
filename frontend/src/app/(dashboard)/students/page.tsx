"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { hasRole, R, useMe } from "@/lib/auth";
import { Badge, Button, EmptyState, Field, Icon, Input, MailLink, PageHeader, PhoneLink, Reveal, Select, StatCard, useToast, Portal } from "@/components/ui";

import { TableView } from "@/components/TableView";
import { initials } from "@/components/RecordCard";
type ClassItem = { id: string; name: string; section: string | null };
type Student = {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  motherName: string | null;
  mobileNumber: string | null;
  email: string | null;
  gender: string;
  rollNo: string | null;
  status: string;
  class?: { id: string; name: string; section: string | null } | null;
};
type Paged = { total: number; page: number; page_size: number; contacts_hidden?: boolean; data: Student[] };

const STATUSES = ["Active", "Inactive", "Left", "Transferred", "Alumni"];

const EMPTY_FORM = {
  id: "",
  admission_no: "",
  full_name: "",
  father_name: "",
  mother_name: "",
  mobile_number: "",
  email: "",
  gender: "Male",
  class_id: "",
  roll_no: "",
  status: "Active",
};

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [result, setResult] = useState<Paged | null>(null);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const toast = useToast();
  const { me, loading: meLoading } = useMe();
  const canRead = hasRole(me, R.STUDENT_READ);
  const canWrite = hasRole(me, R.STUDENT_WRITE);
  const canDelete = hasRole(me, R.ADMINS);

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "10" });
      if (query) params.set("q", query);
      if (classFilter) params.set("class_id", classFilter);
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiFetch<Paged>(`/api/students?${params.toString()}`);
      setResult(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [page, query, classFilter, statusFilter, canRead]);

  useEffect(() => {
    if (!canRead) return;
    apiFetch<ClassItem[]>("/api/classes")
      .then(setClasses)
      .catch(() => undefined);
  }, [canRead]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, class_id: classes[0]?.id ?? "" });
    setShowForm(true);
  };

  const openEdit = (s: Student) => {
    setForm({
      id: s.id,
      admission_no: s.admissionNo,
      full_name: s.fullName,
      father_name: s.fatherName ?? "",
      mother_name: s.motherName ?? "",
      mobile_number: s.mobileNumber ?? "",
      email: s.email ?? "",
      gender: s.gender,
      class_id: s.class?.id ?? "",
      roll_no: s.rollNo ?? "",
      status: s.status,
    });
    setSelectedStudent(s);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.admission_no || !form.full_name || !form.class_id) {
      setMessage("Admission no, name and class are required");
      return;
    }
    setLoading(true);
    setMessage("");

    const payload = {
      ...form,
      email: form.email?.trim() || undefined,
      mobile_number: form.mobile_number?.trim() || undefined,
      father_name: form.father_name?.trim() || undefined,
      mother_name: form.mother_name?.trim() || undefined,
      roll_no: form.roll_no?.trim() || undefined,
    };

    try {
      if (form.id) {
        await apiFetch(`/api/students/${form.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/students", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setSelectedStudent(null);
      await load();
      setMessage("Saved ✓");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  /** Hard delete only succeeds for a record with no history; otherwise the API answers 409. */
  const remove = async (s: Student) => {
    if (!window.confirm(`Delete ${s.fullName}? This only works for a record created by mistake (no attendance, marks or fees). Use "Mark as Left" for students who have left.`)) return;
    setLoading(true);
    try {
      await apiFetch(`/api/students/${s.id}`, { method: "DELETE" });
      await load();
      setMessage("Deleted");
    } catch (e) {
      setMessage(`Delete failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setLoading(false);
    }
  };

  const setLeft = async (s: Student) => {
    const reason = window.prompt(`Mark ${s.fullName} as Left? Their records are kept and a Transfer Certificate can be issued. Reason (optional):`);
    if (reason === null) return;
    try {
      await apiFetch(`/api/students/${s.id}/status`, { method: "PUT", body: JSON.stringify({ status: "Left", ...(reason.trim() ? { reason: reason.trim() } : {}) }) });
      await load();
      setMessage("Marked as Left");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  if (!meLoading && me && !canRead) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Student records are available to office, leadership and teaching staff." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <Reveal>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <PageHeader
            icon="students"
            title="Students"
            subtitle="The master record — admission, profile and status for every student."
            actions={canWrite &&
              <Button variant="primary" onClick={openCreate} className="shadow-lg shadow-brand-700/20 hover:shadow-xl hover:shadow-brand-700/30 transition-all duration-300">
                <Icon name="plus" className="h-4 w-4" /> Add Student
              </Button>
            }
          />
        </div>
      </Reveal>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Students" value={result?.total ?? null} icon="students" tone="brand" delay={0} />
        <StatCard label="On This Page" value={result?.data.length ?? null} icon="list" tone="teal" delay={60} />
        <StatCard label="Classes" value={classes.length} icon="layers" tone="sky" delay={120} />
        <StatCard label="Active" value={result?.data.filter((s) => s.status === "Active").length ?? null} icon="check" tone="emerald" delay={180} />
      </div>

      {/* Filter Bar */}
      <Reveal delay={60}>
        <div className="rounded-2xl border border-line bg-white/80 p-4 shadow-soft backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search by student name or roll..."
                aria-label="Search students by name"
                className="w-full rounded-xl border border-line bg-surface-2/60 pl-10 pr-4 py-2.5 text-sm text-ink placeholder-ink-3/60 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all duration-200"
              />
            </div>
            <div className="relative">
              <select
                value={classFilter}
                onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                aria-label="Filter by class"
                className="appearance-none rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 pr-10 text-sm font-medium text-ink focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all duration-200"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </select>
              <Icon name="chevronDown" className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                aria-label="Filter by status"
                className="appearance-none rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 pr-10 text-sm font-medium text-ink focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all duration-200"
              >
                <option value="">Any status</option>
                {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <Icon name="chevronDown" className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Table Card */}
      <Reveal delay={120}>
        <div className="rounded-2xl border border-line bg-white shadow-soft overflow-hidden">
          {/* Table Header */}
          <div className="border-b border-line bg-surface px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-semibold text-ink">Student Records</h3>
                <p className="text-xs text-ink-3 mt-0.5">Comprehensive directory of enrolled students</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-line bg-surface-2/80 px-3 py-1 text-xs font-medium text-ink-2 shadow-2xs">
                <Icon name="sparkles" className="h-3.5 w-3.5 text-accent-500" />
                <span>Sorted by admission date</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <TableView id="t1" title="Name">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-surface-2/30">
                  <th className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Adm No</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Name</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Class</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Roll</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Contact</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-left text-xs font-semibold text-ink-2 uppercase tracking-wider">Status</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-right text-xs font-semibold text-ink-2 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(result?.data ?? []).map((s, index) => (
                  <tr
                    key={s.id}
                    className="group row-enter transition-all duration-200 hover:bg-brand-50/50 hover:shadow-sm"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className="px-3 py-3">
                      <span className="inline-flex whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs font-mono font-medium text-ink-2">
                        {s.admissionNo}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700">
                          {initials(s.fullName)}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/students/${s.id}`} className="whitespace-nowrap font-semibold text-ink hover:text-brand-700 hover:underline">{s.fullName}</Link>
                          <p className="text-xs text-ink-3">{s.gender}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700">
                        <Icon name="layers" className="h-3.5 w-3.5" />
                        {s.class ? `${s.class.name} ${s.class.section ?? ""}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="whitespace-nowrap font-mono text-[13px] text-ink-2">{s.rollNo ?? "—"}</span>
                    </td>
                    <td className="px-3 py-3">
                      {result?.contacts_hidden ? <span className="text-xs text-ink-3" title="Parent contact details are visible to office and leadership roles">Restricted</span> :
                      <div className="flex flex-col gap-1 whitespace-nowrap text-xs">
                        <span className="flex items-center gap-1.5">
                          <Icon name="phone" className="h-3.5 w-3.5 text-ink-3" />
                          {s.mobileNumber ? (
                            <PhoneLink value={s.mobileNumber} className="text-accent-600 hover:underline" />
                          ) : <span className="text-ink-3">—</span>}
                        </span>
                        {s.email && (
                          <span className="flex items-center gap-1.5 text-ink-3">
                            <Icon name="mail" className="h-3.5 w-3.5" />
                            <span className="block max-w-[12.5rem] truncate" title={s.email}><MailLink value={s.email} className="text-accent-600 hover:underline" /></span>
                          </span>
                        )}
                      </div>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={s.status === "Active" ? "emerald" : "slate"}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${s.status === "Active" ? "bg-ok-soft text-ok-ink ring-1 ring-ok-line" : "bg-slate-100 text-ink-2 ring-1 ring-line"}`}
                      >
                        <Icon name={s.status === "Active" ? "check" : "x"} className="h-3.5 w-3.5" />
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {/* Always visible — they used to appear only on hover and sat off-screen.
                          Icon-only in table view; `.row-action-label` shows the words on cards. */}
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <Link
                          href={`/students/${s.id}`}
                          title="View profile"
                          aria-label={`View profile of ${s.fullName}`}
                          className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-white px-2.5 text-xs font-semibold text-ink-2 shadow-xs transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Icon name="eye" className="h-3.5 w-3.5 shrink-0" />
                          <span className="row-action-label hidden">Profile</span>
                        </Link>
                        {canWrite && <button
                          onClick={() => openEdit(s)}
                          title="Edit student"
                          aria-label={`Edit ${s.fullName}`}
                          className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-white px-2.5 text-xs font-semibold text-ink-2 shadow-xs transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Icon name="edit" className="h-3.5 w-3.5 shrink-0" />
                          <span className="row-action-label hidden">Edit</span>
                        </button>}
                        {canWrite && s.status === "Active" && (
                          <button
                            onClick={() => setLeft(s)}
                            title="Mark as Left"
                            aria-label={`Mark ${s.fullName} as Left`}
                            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-warn-line bg-warn-soft px-2.5 text-xs font-semibold text-warn-ink shadow-xs transition-colors hover:border-warn"
                          >
                            <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />
                            <span className="row-action-label hidden">Mark Left</span>
                          </button>
                        )}
                        {canDelete && <button
                          onClick={() => remove(s)}
                          title="Delete student"
                          aria-label={`Delete ${s.fullName}`}
                          className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-danger-line bg-danger-soft px-2.5 text-xs font-semibold text-danger-ink shadow-xs transition-colors hover:border-danger"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5 shrink-0" />
                          <span className="row-action-label hidden">Delete</span>
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {(result?.data.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-slate-100 p-4">
                          <Icon name="students" className="h-8 w-8 text-ink-3" />
                        </div>
                        <p className="text-sm font-medium text-ink-2">{loading ? "Loading students..." : "No students found"}</p>
                        <p className="text-xs text-ink-3">Try adjusting your search or filters</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </TableView>
          </div>

          {/* Footer */}
          <div className="border-t border-line bg-surface-2/50 px-6 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-2">
                <span className="font-semibold text-ink">{result?.total ?? 0}</span> student(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                  <Icon name="chevronLeft" className="h-4 w-4" />
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-medium text-ink-2 bg-white rounded-lg border border-line">
                  Page {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                  Next
                  <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Modal */}
      {showForm && ( <Portal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-900/60 p-4 backdrop-blur-md"
          onClick={() => setShowForm(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl border border-line bg-white p-6 shadow-2xl"
            style={{ animation: "scale-in 0.3s var(--ease-spring) both" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-ink">{form.id ? "Edit Student" : "Add Student"}</h3>
                <p className="text-sm text-ink-2 mt-0.5">
                  {form.id ? "Update student information" : "Register a new student in the system"}
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-ink-3 hover:bg-slate-100 hover:text-ink-2 transition-all duration-150"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Admission no" required hint={form.id ? "Cannot be changed after creation" : undefined}>
                <Input
                  value={form.admission_no}
                  onChange={(e) => setForm({ ...form, admission_no: e.target.value })}
                  placeholder="ADM-2026-0001"
                  disabled={!!form.id}
                  className={form.id ? "bg-slate-100 cursor-not-allowed" : "bg-surface-2 hover:bg-white"}
                />
              </Field>
              <Field label="Full name" required>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Student name"
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Father's name">
                <Input
                  value={form.father_name}
                  onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Mother's name">
                <Input
                  value={form.mother_name}
                  onChange={(e) => setForm({ ...form, mother_name: e.target.value })}
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Mobile">
                <Input
                  type="tel"
                  value={form.mobile_number}
                  onChange={(e) => setForm({ ...form, mobile_number: e.target.value })}
                  placeholder="98XXXXXXXX"
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Gender">
                <Select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="bg-surface-2 hover:bg-white"
                >
                  {["Male", "Female", "Other"].map((g) => <option key={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Class" required>
                <Select
                  value={form.class_id}
                  onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                  className="bg-surface-2 hover:bg-white"
                >
                  <option value="">Select class *</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
                </Select>
              </Field>
              <Field label="Roll no">
                <Input
                  value={form.roll_no}
                  onChange={(e) => setForm({ ...form, roll_no: e.target.value })}
                  placeholder="Auto-assigned if blank"
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="bg-surface-2 hover:bg-white"
                >
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-line">
              <Button variant="soft" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={loading} className="shadow-lg shadow-brand-700/20">
                {form.id ? "Update" : "Save"} Student
              </Button>
            </div>
          </div>
        </div>
      </Portal>)}
    </div>
  );
}
