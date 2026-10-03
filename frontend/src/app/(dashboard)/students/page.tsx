"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Field, Icon, Input, MailLink, PageHeader, PhoneLink, Reveal, Select, StatCard, useToast } from "@/components/ui";

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
type Paged = { total: number; page: number; page_size: number; data: Student[] };

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
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const load = useCallback(async () => {
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
  }, [page, query, classFilter, statusFilter]);

  useEffect(() => {
    apiFetch<ClassItem[]>("/api/classes")
      .then(setClasses)
      .catch(() => undefined);
  }, []);

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
    setShowForm(true);
  };

  const save = async () => {
    if (!form.admission_no || !form.full_name || !form.class_id) {
      setMessage("Admission no, name and class are required");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      if (form.id) {
        await apiFetch(`/api/students/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await apiFetch("/api/students", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      await load();
      setMessage("Saved ✓");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setLoading(true);
    try {
      await apiFetch(`/api/students/${id}`, { method: "DELETE" });
      await load();
      setMessage("Deleted");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const setInactive = async (id: string) => {
    try {
      await apiFetch(`/api/students/${id}/status`, { method: "PUT", body: JSON.stringify({ status: "Inactive" }) });
      await load();
      setMessage("Marked inactive");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="students"
          title="Students"
          subtitle="The master record — admission, profile and status for every student."
          actions={
            <Button variant="primary" onClick={openCreate}>
              <Icon name="plus" className="h-4 w-4" /> Add Student
            </Button>
          }
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Total Students" value={result?.total ?? null} tone="brand" icon="students" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="On This Page" value={result?.data.length ?? null} tone="teal" icon="reports" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Classes" value={classes.length} tone="violet" icon="timetable" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Active" value={result?.data.filter((s) => s.status === "Active").length ?? null} tone="emerald" icon="check" />
        </Reveal>
      </div>

      <Reveal delay={60} className="card flex flex-wrap items-center gap-3 p-4">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="Search name…"
          aria-label="Search students by name"
          className="field w-auto"
        />
        <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setPage(1); }} aria-label="Filter by class" className="field w-auto">
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} aria-label="Filter by status" className="field w-auto">
          <option value="">Any status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </Reveal>

      <Reveal delay={120}>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Adm No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Roll</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(result?.data ?? []).map((s) => (
              <tr key={s.id} className="row-hover border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{s.admissionNo}</td>
                <td className="px-4 py-3 font-semibold">{s.fullName}</td>
                <td className="px-4 py-3">{s.class ? `${s.class.name} ${s.class.section ?? ""}` : "—"}</td>
                <td className="px-4 py-3">{s.rollNo ?? "—"}</td>
                <td className="px-4 py-3 text-xs">
                  <span className="flex flex-col gap-0.5">
                    <PhoneLink value={s.mobileNumber} />
                    {s.email && <MailLink value={s.email} className="text-[11px] text-slate-400" />}
                    {!s.mobileNumber && !s.email && <span className="text-slate-400">—</span>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={s.status === "Active" ? "emerald" : "slate"}>{s.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(s)} className="btn-soft mr-1.5 !px-2.5 !py-1 text-xs">Edit</button>
                  <button onClick={() => setInactive(s.id)} className="btn-soft mr-1.5 !px-2.5 !py-1 text-xs">Deactivate</button>
                  <button onClick={() => remove(s.id)} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {(result?.data.length ?? 0) === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No students found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </Reveal>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{result ? `${result.total} student(s)` : ""}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-soft !px-3 !py-1.5">← Prev</button>
          <span className="px-2 py-1.5">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn-soft !px-3 !py-1.5">Next →</button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-lg p-6" style={{ animation: "scale-in 0.3s var(--ease-spring) both" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold">{form.id ? "Edit Student" : "Add Student"}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Admission no" required hint={form.id ? "Cannot be changed after creation" : undefined}>
                <Input value={form.admission_no} onChange={(e) => setForm({ ...form, admission_no: e.target.value })} placeholder="ADM-2026-0001" disabled={!!form.id} className={form.id ? "bg-slate-100" : ""} />
              </Field>
              <Field label="Full name" required>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Student name" />
              </Field>
              <Field label="Father's name">
                <Input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
              </Field>
              <Field label="Mother's name">
                <Input value={form.mother_name} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} />
              </Field>
              <Field label="Mobile">
                <Input type="tel" value={form.mobile_number} onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} placeholder="98XXXXXXXX" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Gender">
                <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  {["Male", "Female", "Other"].map((g) => <option key={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Class" required>
                <Select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                  <option value="">Select class *</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
                </Select>
              </Field>
              <Field label="Roll no">
                <Input value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} placeholder="Auto-assigned if blank" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {["Active", "Inactive"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="soft" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={save} loading={loading}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
