"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Field, Icon, Input, MailLink, PageHeader, PhoneLink, Reveal, Select, StatCard, useToast } from "@/components/ui";
import { X } from "lucide-react";

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
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
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

  const StatCardSimple = ({ label, value, icon, colorClass, bgClass }: { label: string; value: number | null; icon: string; colorClass: string; bgClass: string }) => (
    <Reveal>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 group">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${colorClass} transition-all duration-300 group-hover:scale-105`}>
              {value === null ? <span className="text-slate-300">—</span> : value}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${bgClass} ${colorClass} group-hover:rotate-6 transition-transform duration-300`}>
            <Icon name={icon} className="h-6 w-6" />
          </div>
        </div>
      </div>
    </Reveal>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <Reveal>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <PageHeader
            icon="students"
            title="Students"
            subtitle="The master record — admission, profile and status for every student."
            actions={
              <Button variant="primary" onClick={openCreate} className="shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300">
                <Icon name="plus" className="h-4 w-4" /> Add Student
              </Button>
            }
          />
        </div>
      </Reveal>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCardSimple label="Total Students" value={result?.total ?? null} icon="students" colorClass="text-blue-600" bgClass="bg-blue-50" />
        <StatCardSimple label="On This Page" value={result?.data.length ?? null} icon="reports" colorClass="text-teal-600" bgClass="bg-teal-50" />
        <StatCardSimple label="Classes" value={classes.length} icon="timetable" colorClass="text-violet-600" bgClass="bg-violet-50" />
        <StatCardSimple label="Active" value={result?.data.filter((s) => s.status === "Active").length ?? null} icon="check" colorClass="text-emerald-600" bgClass="bg-emerald-50" />
      </div>

      {/* Filter Bar */}
      <Reveal delay={60}>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Icon name="spark" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search name..."
                aria-label="Search students by name"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              />
            </div>
            <div className="relative">
              <select
                value={classFilter}
                onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                aria-label="Filter by class"
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </select>
              <Icon name="menu" className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                aria-label="Filter by status"
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              >
                <option value="">Any status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <Icon name="menu" className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Table Card */}
      <Reveal delay={120}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Student Records</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Icon name="spark" className="h-4 w-4" />
                <span>Sorted by admission date</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30">
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Adm No</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Class</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Roll</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(result?.data ?? []).map((s, index) => (
                  <tr
                    key={s.id}
                    className="group transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm"
                    style={{
                      animation: `fade-in 0.4s ease-out ${index * 50}ms both`,
                      animationName: "fade-in",
                    }}
                  >
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-mono font-medium text-slate-600">
                        <Icon name="spark" className="h-3 w-3 text-slate-400" />
                        {s.admissionNo}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white text-sm font-bold shadow-sm">
                          {s.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{s.fullName}</p>
                          <p className="text-xs text-slate-400">{s.gender}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
                        <Icon name="timetable" className="h-3.5 w-3.5" />
                        {s.class ? `${s.class.name} ${s.class.section ?? ""}` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{s.rollNo ?? "—"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="flex items-center gap-1">
                          <Icon name="print" className="h-3.5 w-3.5 text-slate-400" />
                          {s.mobileNumber ? (
                            <PhoneLink value={s.mobileNumber} className="text-blue-600 hover:underline" />
                          ) : <span className="text-slate-400">—</span>}
                        </span>
                        {s.email && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Icon name="spark" className="h-3.5 w-3.5" />
                            <MailLink value={s.email} className="text-blue-600 hover:underline" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        tone={s.status === "Active" ? "emerald" : "slate"}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${s.status === "Active" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}
                      >
                        <Icon name={s.status === "Active" ? "check" : "x"} className="h-3.5 w-3.5" />
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          onClick={() => openEdit(s)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 shadow-xs transition-all duration-150"
                        >
                          <Icon name="plus" className="h-3.5 w-3.5 rotate-45" />
                          Edit
                        </button>
                        <button
                          onClick={() => setInactive(s.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 hover:border-amber-300 hover:text-amber-800 shadow-xs transition-all duration-150"
                        >
                          <Icon name="alert" className="h-3.5 w-3.5" />
                          Deactivate
                        </button>
                        <button
                          onClick={() => remove(s.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 hover:border-rose-300 hover:text-rose-800 shadow-xs transition-all duration-150"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(result?.data.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-slate-100 p-4">
                          <Icon name="students" className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-600">{loading ? "Loading students..." : "No students found"}</p>
                        <p className="text-xs text-slate-400">Try adjusting your search or filters</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                <span className="font-semibold text-slate-800">{result?.total ?? 0}</span> student(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                  <Icon name="menu" className="h-4 w-4 -rotate-90" />
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white rounded-lg border border-slate-200">
                  Page {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                  Next
                  <Icon name="menu" className="h-4 w-4 rotate-90" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-md"
          onClick={() => setShowForm(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            style={{ animation: "scale-in 0.3s var(--ease-spring) both" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{form.id ? "Edit Student" : "Add Student"}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {form.id ? "Update student information" : "Register a new student in the system"}
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all duration-150"
              >
                <X className="h-5 w-5" />
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
                  className={form.id ? "bg-slate-100 cursor-not-allowed" : "bg-slate-50 hover:bg-white"}
                />
              </Field>
              <Field label="Full name" required>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Student name"
                  className="bg-slate-50 hover:bg-white"
                />
              </Field>
              <Field label="Father's name">
                <Input
                  value={form.father_name}
                  onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                  className="bg-slate-50 hover:bg-white"
                />
              </Field>
              <Field label="Mother's name">
                <Input
                  value={form.mother_name}
                  onChange={(e) => setForm({ ...form, mother_name: e.target.value })}
                  className="bg-slate-50 hover:bg-white"
                />
              </Field>
              <Field label="Mobile">
                <Input
                  type="tel"
                  value={form.mobile_number}
                  onChange={(e) => setForm({ ...form, mobile_number: e.target.value })}
                  placeholder="98XXXXXXXX"
                  className="bg-slate-50 hover:bg-white"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="bg-slate-50 hover:bg-white"
                />
              </Field>
              <Field label="Gender">
                <Select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="bg-slate-50 hover:bg-white"
                >
                  {["Male", "Female", "Other"].map((g) => <option key={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Class" required>
                <Select
                  value={form.class_id}
                  onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                  className="bg-slate-50 hover:bg-white"
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
                  className="bg-slate-50 hover:bg-white"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="bg-slate-50 hover:bg-white"
                >
                  {["Active", "Inactive"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="soft" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={loading} className="shadow-lg shadow-blue-500/20">
                {form.id ? "Update" : "Save"} Student
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
