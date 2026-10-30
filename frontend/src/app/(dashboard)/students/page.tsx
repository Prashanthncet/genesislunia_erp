"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { hasRole, R, useMe } from "@/lib/auth";
import { sanitizePhone, sanitizePersonName, validatePhone, validateEmail, validatePersonName } from "@/lib/validation";
import { makeQrDataUrl } from "@/lib/qr";
import { Button, EmptyState, Field, Icon, IconButton, Input, MailLink, Modal, PageHeader, PhoneLink, Reveal, Select, SkeletonRows, StatCard, Textarea, useToast, Portal } from "@/components/ui";
import { confirmAction, confirmWithReason } from "@/components/confirm";

import { TableView } from "@/components/TableView";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { useMobileBack } from "@/components/mobile/useMobileBack";
import { MAvatar, MCard, MChip, MCopyRow, MPanel } from "@/components/mobile/MobileCard";
import {
  CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Chip, Monogram, RecordCard, StatusPill, initials, toneFor, type Tone,
} from "@/components/RecordCard";

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
  house?: string | null;
  status: string;
  class?: { id: string; name: string; section: string | null } | null;
};
type Paged = { total: number; page: number; page_size: number; contacts_hidden?: boolean; data: Student[] };

const STATUSES = ["Active", "Inactive", "Left", "Transferred", "Alumni"];
/** Status colour + text (never colour alone). */
const STATUS_TONE: Record<string, Tone> = { Active: "ok", Inactive: "warn", Left: "slate", Transferred: "sky", Alumni: "navy" };
const classText = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(" ");

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
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkClassId, setBulkClassId] = useState("");
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [showIdCardsModal, setShowIdCardsModal] = useState(false);
  const [idCardClassId, setIdCardClassId] = useState("");
  const [idCardStyle, setIdCardStyle] = useState<"classic" | "modern" | "compact" | "crest">("classic");
  const [idCardStudents, setIdCardStudents] = useState<Student[]>([]);
  const [idCardLoading, setIdCardLoading] = useState(false);
  const toast = useToast();
  const { me, loading: meLoading } = useMe();
  const canRead = hasRole(me, R.STUDENT_READ);
  const canWrite = hasRole(me, R.STUDENT_WRITE);
  const canDelete = hasRole(me, R.ADMINS);
  /** Warden (and other read-only roles) see the directory without edit/delete actions. */
  const readOnly = !canWrite && !canDelete;

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
    const academic = hasRole(me, R.ACADEMIC_STAFF);
    (academic
      ? apiFetch<ClassItem[]>("/api/classes")
      : apiFetch<{ classes: ClassItem[] }>("/api/gate-passes/filters").then((r) => r.classes))
      .then(setClasses)
      .catch(() => undefined);
  }, [canRead, me]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, class_id: classes[0]?.id ?? "" });
    setShowForm(true);
  };

  const openBulkUpload = () => {
    setBulkClassId(classFilter || classes[0]?.id || "");
    setBulkCsvText(
      "admission_no,full_name,gender,roll_no,father_name,mother_name,mobile_number,house,blood_group\nADM-2026-901,Aarav Kulkarni,Male,41,Ramesh Kulkarni,Sunita Kulkarni,9876543210,Shivaji,O+\nADM-2026-902,Ananya Deshmukh,Female,42,Vikram Deshmukh,Priya Deshmukh,9876543211,Tagore,B+",
    );
    setShowBulkModal(true);
  };

  const parseBulkCsv = useCallback(() => {
    const lines = bulkCsvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const hasHeader = header.includes("admission_no") || header.includes("full_name") || header.includes("name");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const idx = (names: string[], fallback: number) => {
      if (!hasHeader) return fallback;
      for (const n of names) {
        const i = header.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    return dataLines.map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const get = (names: string[], fb: number) => {
        const i = idx(names, fb);
        return i >= 0 && i < cols.length ? cols[i] : "";
      };
      const genderRaw = get(["gender", "sex"], 2);
      const gender = ["Male", "Female", "Other"].find((g) => g.toLowerCase() === genderRaw.toLowerCase()) ?? "Male";
      return {
        admission_no: get(["admission_no", "admissionno", "adm_no"], 0),
        full_name: get(["full_name", "fullname", "name", "student_name"], 1),
        gender,
        roll_no: get(["roll_no", "rollno", "roll"], 3) || undefined,
        father_name: get(["father_name", "father"], 4) || undefined,
        mother_name: get(["mother_name", "mother"], 5) || undefined,
        mobile_number: get(["mobile_number", "mobile", "phone", "parent_contact"], 6) || undefined,
        house: get(["house"], 7) || undefined,
        blood_group: get(["blood_group", "blood"], 8) || undefined,
        class_id: bulkClassId,
      };
    }).filter((r) => r.admission_no && r.full_name);
  }, [bulkCsvText, bulkClassId]);

  const downloadSampleCsv = () => {
    const csv = "admission_no,full_name,gender,roll_no,father_name,mother_name,mobile_number,house,blood_group\nADM-2026-901,Aarav Kulkarni,Male,41,Ramesh Kulkarni,Sunita Kulkarni,9876543210,Shivaji,O+\nADM-2026-902,Ananya Deshmukh,Female,42,Vikram Deshmukh,Priya Deshmukh,9876543211,Tagore,B+\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-bulk-sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const submitBulkUpload = async () => {
    if (!bulkClassId) {
      toast.push("Please select a target class for bulk upload", "error");
      return;
    }
    const rows = parseBulkCsv();
    if (rows.length === 0) {
      toast.push("No valid student rows found in CSV", "error");
      return;
    }
    setBulkUploading(true);
    try {
      const res = await apiFetch<{ created: number; skipped_duplicates: number }>("/api/students/bulk", {
        method: "POST",
        body: JSON.stringify({ students: rows }),
      });
      setShowBulkModal(false);
      await load();
      toast.push(
        `Bulk upload complete: ${res.created} student(s) added${res.skipped_duplicates ? ` (${res.skipped_duplicates} duplicate skipped)` : ""}`,
        "success",
      );
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Bulk upload failed", "error");
    } finally {
      setBulkUploading(false);
    }
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
      toast.push("Admission no, name and class are required", "error");
      return;
    }
    const nameErr = validatePersonName(form.full_name, true, "Student full name");
    if (nameErr) { setMessage(nameErr); toast.push(nameErr, "error"); return; }
    if (form.mobile_number) {
      const pErr = validatePhone(form.mobile_number, false, "Mobile number");
      if (pErr) { setMessage(pErr); toast.push(pErr, "error"); return; }
    }
    if (form.email) {
      const eErr = validateEmail(form.email, false, "Email");
      if (eErr) { setMessage(eErr); toast.push(eErr, "error"); return; }
    }
    let leavingReason = "";
    if (form.id && (form.status === "Left" || form.status === "Transferred") && selectedStudent?.status !== form.status) {
      const r = await confirmWithReason({
        title: `Mark ${form.full_name.trim() || "this student"} as ${form.status}?`,
        text: "A mandatory reason is required before marking a student as leaving.",
        placeholder: "Enter reason for leaving (required)",
        confirmText: `Mark as ${form.status}`,
        tone: "danger",
        required: true,
        errorMessage: "Please enter a valid reason before continuing.",
      });
      if (!r || !r.trim()) return;
      leavingReason = r.trim();
    } else if (form.id && !(await confirmAction({ title: `Update ${form.full_name.trim() || "this student"}?`, text: "Saves your changes to the student record.", confirmText: "Update", tone: "primary" }))) return;
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
        if (leavingReason) {
          await apiFetch(`/api/students/${form.id}/status`, { method: "PUT", body: JSON.stringify({ status: form.status, reason: leavingReason }) });
        }
      } else {
        await apiFetch("/api/students", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setSelectedStudent(null);
      await load();
      toast.push(`${form.full_name.trim()} ${form.id ? "updated" : "added"}`, "success");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setLoading(false);
    }
  };

  /** Hard delete only succeeds for a record with no history; otherwise the API answers 409. */
  const remove = async (s: Student) => {
    const reason = await confirmWithReason({
      title: `Remove ${s.fullName}?`,
      text: 'Enter a mandatory reason for removing this student. Records with history should use "Mark left" instead.',
      placeholder: "Enter reason for removal (required)",
      confirmText: "Delete",
      tone: "danger",
      required: true,
      errorMessage: "Please enter a valid reason before removing this student.",
    });
    if (!reason || !reason.trim()) return;
    setLoading(true);
    try {
      await apiFetch(`/api/students/${s.id}`, { method: "DELETE" });
      await load();
      toast.push(`${s.fullName} deleted`, "success");
    } catch (e) {
      toast.push(`Delete failed: ${e instanceof Error ? e.message : "error"}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const setLeft = async (s: Student) => {
    const reason = await confirmWithReason({
      title: `Mark ${s.fullName} as Left?`,
      text: "Their records are kept and a Transfer Certificate can be issued. A valid reason is required.",
      placeholder: "Enter reason for leaving (required)",
      confirmText: "Mark left",
      tone: "danger",
      required: true,
      errorMessage: "Please enter a valid reason for leaving.",
    });
    if (!reason || !reason.trim()) return;
    try {
      await apiFetch(`/api/students/${s.id}/status`, { method: "PUT", body: JSON.stringify({ status: "Left", reason: reason.trim() }) });
      await load();
      toast.push(`${s.fullName} marked as Left`, "success");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not mark as Left", "error");
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;
  const filtered = !!(query || classFilter || statusFilter);
  const parsedBulkRows = parseBulkCsv();

  useMobileBack(showForm, () => setShowForm(false));

  /** Card view: a purpose-built student card (TableView `cards`), not the generic restyle. */
  const cards = (
    <CardGrid min="17.5rem" empty={<CardEmpty icon="students" title={loading ? "Loading students…" : "No students found"} hint="Try adjusting your search or filters." />}>
      {(result?.data ?? []).map((s) => (
        <RecordCard key={s.id} rail={STATUS_TONE[s.status] === "ok" ? undefined : STATUS_TONE[s.status] ?? "slate"}>
          <CardBody>
            <CardTitle
              lead={<Monogram text={initials(s.fullName)} tone={toneFor(s.fullName)} size="lg" shape="circle" solid />}
              title={<Link href={`/students/${s.id}`} className="hover:text-brand-700 hover:underline">{s.fullName}</Link>}
              subtitle={<><span className="font-mono">{s.admissionNo}</span>{s.gender ? ` · ${s.gender}` : ""}</>}
              aside={<StatusPill status={s.status} tone={STATUS_TONE[s.status] ?? "slate"} />}
            />
            <div className="flex flex-wrap gap-1.5">
              <Chip icon="layers" tone="blue">{s.class ? classText(s.class) : "No class"}</Chip>
              {s.rollNo && <Chip>Roll <span className="tnum">{s.rollNo}</span></Chip>}
              {s.house && <Chip tone={toneFor(s.house)}>{s.house} House</Chip>}
            </div>
            {!result?.contacts_hidden && (s.mobileNumber || s.email) && (
              <div className="space-y-1 text-[12.5px]">
                {s.mobileNumber && <p className="flex items-center gap-2"><Icon name="phone" className="h-3.5 w-3.5 text-ink-3" /><PhoneLink value={s.mobileNumber} className="tnum" /></p>}
                {s.email && <p className="flex min-w-0 items-center gap-2"><Icon name="mail" className="h-3.5 w-3.5 shrink-0 text-ink-3" /><span className="truncate"><MailLink value={s.email} /></span></p>}
              </div>
            )}
          </CardBody>
          <CardFooter>
            <Link href={`/students/${s.id}`} className="btn-soft !min-h-8 !px-2.5 !py-1.5 !text-[12.5px] max-md:!min-h-10 max-md:!px-3">
              <Icon name="eye" className="h-3.5 w-3.5" /> Profile
            </Link>
            {canWrite && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Icon name="edit" className="h-3.5 w-3.5" /> Edit</Button>}
            {canWrite && s.status === "Active" && <Button size="sm" variant="ghost" onClick={() => setLeft(s)}><Icon name="flag" className="h-3.5 w-3.5" /> Mark left</Button>}
            {canDelete && <IconButton name="trash" label={`Delete ${s.fullName}`} variant="ghost" className="!min-h-8 !px-2 !py-1.5 max-md:!min-h-10 max-md:!px-3 text-danger hover:!bg-danger-soft hover:!text-danger" onClick={() => remove(s)} />}
          </CardFooter>
        </RecordCard>
      ))}
    </CardGrid>
  );

  /** Phones: student card (avatar + status, class/roll/house chips, contact panel, 2×2 actions). */
  const mobileCards = (result?.data ?? []).length === 0 ? (
    <CardEmpty icon="students" title={loading ? "Loading students…" : "No students found"} hint="Try adjusting your search or filters." />
  ) : (result?.data ?? []).map((s) => {
    const tone = toneFor(s.fullName);
    return (
      <MCard key={s.id} tone={tone}>
        <div className="flex items-start gap-3.5">
          <MAvatar name={s.fullName} tone={tone} size={60} dot={STATUS_TONE[s.status] ?? "slate"} />
          <div className="min-w-0 flex-1 pt-0.5">
            <Link href={`/students/${s.id}`} className="block text-[17px] font-bold leading-snug text-ink">{s.fullName}</Link>
            <p className="mt-0.5 text-[13px] text-ink-3"><span className="font-mono">{s.admissionNo}</span>{s.gender ? ` · ${s.gender}` : ""}</p>
            <div className="mt-2"><StatusPill status={s.status} tone={STATUS_TONE[s.status] ?? "slate"} /></div>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <MChip icon="layers" tone="blue">{s.class ? classText(s.class) : "No class"}</MChip>
          {s.rollNo && <MChip icon="hash">Roll {s.rollNo}</MChip>}
          {s.house && <MChip icon="home" tone={toneFor(s.house)}>{s.house} House</MChip>}
        </div>
        {!result?.contacts_hidden && (s.mobileNumber || s.email) && (
          <div className="mt-3">
            <MPanel>
              <div className="divide-y divide-line">
                {s.mobileNumber && <MCopyRow icon="phone" value={s.mobileNumber} href={`tel:${s.mobileNumber}`} />}
                {s.email && <MCopyRow icon="mail" value={s.email} href={`mailto:${s.email}`} />}
              </div>
            </MPanel>
          </div>
        )}
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Link href={`/students/${s.id}`} className="btn-accent !min-h-12 justify-center"><Icon name="eye" className="h-4 w-4" /> Profile</Link>
          {canWrite && <Button variant="soft" onClick={() => openEdit(s)} className="!min-h-12"><Icon name="edit" className="h-4 w-4" /> Edit</Button>}
          {canWrite && s.status === "Active" && <Button variant="soft" onClick={() => setLeft(s)} className="!min-h-12"><Icon name="flag" className="h-4 w-4" /> Mark left</Button>}
          {canDelete && <Button variant="danger" onClick={() => remove(s)} className="!min-h-12"><Icon name="trash" className="h-4 w-4" /> Delete</Button>}
        </div>
      </MCard>
    );
  });

  if (!meLoading && me && !canRead) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Student records are available to office, leadership and teaching staff." />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-md:space-y-5">
      {/* Header */}
      <Reveal>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <PageHeader
            icon="students"
            title="Students"
            subtitle="The master record — admission, profile and status for every student."
            actions={canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="soft" onClick={openBulkUpload}>
                  <Icon name="upload" className="h-4 w-4" /> Bulk Upload Students
                </Button>
                <Button
                  variant="soft"
                  onClick={() => {
                    const targetCls = classFilter || classes[0]?.id || "";
                    setIdCardClassId(targetCls);
                    setShowIdCardsModal(true);
                    if (targetCls) {
                      setIdCardLoading(true);
                      apiFetch<Paged>(`/api/students?class_id=${encodeURIComponent(targetCls)}&page_size=60`)
                        .then((r) => setIdCardStudents(r.data ?? []))
                        .catch(() => setIdCardStudents([]))
                        .finally(() => setIdCardLoading(false));
                    } else {
                      setIdCardStudents(result?.data ?? []);
                    }
                  }}
                >
                  <Icon name="idCard" className="h-4 w-4" /> Class ID Cards
                </Button>
                <Button variant="primary" onClick={openCreate} className="shadow-lg shadow-brand-700/20 hover:shadow-xl hover:shadow-brand-700/30 transition-all duration-300">
                  <Icon name="plus" className="h-4 w-4" /> Add Student
                </Button>
              </div>
            )}
          />
        </div>
      </Reveal>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-md:gap-3">
        <StatCard label="Total Students" value={result?.total ?? null} icon="students" tone="brand" delay={0} />
        <StatCard label="On This Page" value={result?.data.length ?? null} icon="list" tone="teal" delay={60} />
        <StatCard label="Classes" value={classes.length} icon="layers" tone="sky" delay={120} />
        <StatCard label="Active" value={result?.data.filter((s) => s.status === "Active").length ?? null} icon="check" tone="emerald" delay={180} />
      </div>

      {/* Filter Bar */}
      <Reveal delay={60}>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft backdrop-blur-sm max-md:p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-md:min-w-full">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search by name or admission no…"
                aria-label="Search students by name"
                className="w-full rounded-xl border border-line bg-surface-2/60 pl-10 pr-4 py-2.5 text-sm text-ink placeholder-ink-3/60 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all duration-200 max-md:min-h-11"
              />
            </div>
            <MobileFilters
              active={[classFilter, statusFilter].filter(Boolean).length}
              onClear={() => { setClassFilter(""); setStatusFilter(""); setPage(1); }}
            >
            <div className="relative max-md:min-w-[9rem] max-md:flex-1">
              <select
                value={classFilter}
                onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                aria-label="Filter by class"
                className="appearance-none rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 pr-10 text-sm font-medium text-ink focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all duration-200 max-md:min-h-11 max-md:w-full"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </select>
              <Icon name="chevronDown" className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>
            <div className="relative max-md:min-w-[9rem] max-md:flex-1">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                aria-label="Filter by status"
                className="appearance-none rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 pr-10 text-sm font-medium text-ink focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all duration-200 max-md:min-h-11 max-md:w-full"
              >
                <option value="">Any status</option>
                {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <Icon name="chevronDown" className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            </div>
            </MobileFilters>
            {filtered && (
              <Button variant="ghost" onClick={() => { setQuery(""); setClassFilter(""); setStatusFilter(""); setPage(1); }}>
                <Icon name="x" className="h-4 w-4" /> Clear
              </Button>
            )}
            <span className="tnum text-[12.5px] text-ink-3" aria-live="polite">
              {result ? `${result.total} ${result.total === 1 ? "student" : "students"}${filtered ? " match" : ""}` : ""}
            </span>
          </div>
        </div>
      </Reveal>

      {/* Table Card */}
      <Reveal delay={120}>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft max-md:contents">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4 sm:px-6 max-md:!border-0 max-md:!px-0 max-md:pb-1">
            <div>
              <h3 className="text-[17px] font-semibold text-ink">Student records</h3>
              <p className="mt-0.5 text-xs text-ink-3">
                {readOnly ? "Read-only directory — changes are made by the school office." : "Open a profile, edit details or mark a student as left."}
              </p>
            </div>
            {result?.contacts_hidden && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2" title="Parent contact details are visible to office and leadership roles">
                <Icon name="lock" className="h-3.5 w-3.5 text-ink-3" /> Contacts restricted for your role
              </span>
            )}
          </div>

          <TableView id="t1" title="Student" badge="Status" cards={cards} mobileCards={loading && !result ? undefined : mobileCards}>
            <div className="table-wrap">
              <table className="data-table min-w-[920px]">
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[11%]" />
                  <col className="w-[7%]" />
                  <col className="w-[10%]" />
                  <col className="w-[20%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th className="th-end">Roll</th>
                    <th>House</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th className="th-end">Actions</th>
                  </tr>
                </thead>
                {loading && !result ? <SkeletonRows rows={8} cols={7} /> : (
                  <tbody>
                    {(result?.data ?? []).map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Monogram text={initials(s.fullName)} tone={toneFor(s.fullName)} size="sm" shape="circle" />
                            <div className="min-w-0">
                              <Link href={`/students/${s.id}`} className="block truncate font-semibold text-ink hover:text-brand-700 hover:underline">{s.fullName}</Link>
                              <p className="truncate text-[11.5px] text-ink-3">
                                <span className="font-mono">{s.admissionNo}</span>{s.gender ? ` · ${s.gender}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">{s.class ? classText(s.class) : <span className="text-ink-3">—</span>}</td>
                        <td className="td-end tnum whitespace-nowrap">{s.rollNo ?? <span className="text-ink-3">—</span>}</td>
                        <td className="whitespace-nowrap">{s.house ? <Chip tone={toneFor(s.house)}>{s.house}</Chip> : <span className="text-ink-3">—</span>}</td>
                        <td>
                          {result?.contacts_hidden ? <span className="text-xs text-ink-3">Restricted</span> : (
                            <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                              {s.mobileNumber ? <PhoneLink value={s.mobileNumber} className="tnum" /> : <span className="text-ink-3">No phone</span>}
                              {s.email && <span className="block truncate" title={s.email}><MailLink value={s.email} /></span>}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap"><StatusPill status={s.status} tone={STATUS_TONE[s.status] ?? "slate"} /></td>
                        <td className="td-end">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/students/${s.id}`} className="btn-ghost !min-h-9 !px-2.5 !py-2" title="View profile" aria-label={`View profile of ${s.fullName}`}>
                              <Icon name="eye" className="h-4 w-4" />
                              <span className="row-action-label hidden">Profile</span>
                            </Link>
                            {canWrite && (
                              <IconButton name="edit" label={`Edit ${s.fullName}`} variant="ghost" className="!min-h-9" onClick={() => openEdit(s)} />
                            )}
                            {canWrite && s.status === "Active" && (
                              <IconButton name="flag" label={`Mark ${s.fullName} as Left`} variant="ghost" className="!min-h-9" onClick={() => setLeft(s)} />
                            )}
                            {canDelete && (
                              <IconButton name="trash" label={`Delete ${s.fullName}`} variant="ghost" className="!min-h-9 text-danger hover:!bg-danger-soft hover:!text-danger" onClick={() => remove(s)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(result?.data.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState icon="students" title={loading ? "Loading students…" : "No students found"} hint={loading ? undefined : "Try adjusting your search or filters."} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          </TableView>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-5 py-3.5 text-sm sm:px-6 max-md:!px-4">
            <span className="text-ink-2">
              {result && result.total > 0
                ? <>Showing <span className="tnum font-semibold text-ink">{(page - 1) * result.page_size + 1}–{Math.min(page * result.page_size, result.total)}</span> of <span className="tnum font-semibold text-ink">{result.total}</span> students</>
                : <><span className="font-semibold text-ink">0</span> students</>}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="soft" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <Icon name="chevronLeft" className="h-4 w-4" /> Prev
              </Button>
              <span className="tnum rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2">
                Page {page} / {totalPages}
              </span>
              <Button size="sm" variant="soft" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next <Icon name="chevronRight" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Bulk Upload Students Modal */}
      <Modal
        open={showIdCardsModal}
        onClose={() => setShowIdCardsModal(false)}
        title="Bulk Class ID Cards Preview & Print Sheet"
        subtitle="Preview and print/save an entire class's student ID cards with scannable QR codes."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowIdCardsModal(false)}>Close</Button>
            <Button
              variant="primary"
              disabled={idCardStudents.length === 0}
              onClick={() => {
                const win = window.open("", "_blank", "width=960,height=800");
                if (!win) {
                  toast.push("Pop-up blocked — allow pop-ups to print class ID cards", "error");
                  return;
                }
                const clsLabel = classes.find((c) => c.id === idCardClassId);
                const clsTitle = clsLabel ? `${clsLabel.name} ${clsLabel.section ?? ""}`.trim() : "Selected Students";
                const cardsHtml = idCardStudents
                  .map((s) => {
                    const qr = makeQrDataUrl(`STUDENT:${s.admissionNo}|${s.fullName}|${s.class ? classText(s.class) : clsTitle}`, 140);
                    const headerBg =
                      idCardStyle === "modern"
                        ? "linear-gradient(135deg,#0f172a,#1d4ed8)"
                        : idCardStyle === "crest"
                        ? "linear-gradient(135deg,#4c1d95,#7c3aed)"
                        : idCardStyle === "compact"
                        ? "#0f766e"
                        : "#1e3a8a";
                    return `<div class="id-card">
                      <div class="id-head" style="background:${headerBg}">
                        <div class="school">GENESIS PUBLIC SCHOOL</div>
                        <div class="sub">STUDENT IDENTITY CARD · ${idCardStyle.toUpperCase()}</div>
                      </div>
                      <div class="id-body">
                        <div class="info">
                          <div class="name">${s.fullName}</div>
                          <div class="adm">${s.admissionNo}</div>
                          <div class="meta"><b>Class:</b> ${s.class ? classText(s.class) : clsTitle} · <b>Roll:</b> ${s.rollNo ?? "—"}</div>
                          <div class="meta"><b>House:</b> ${s.house ?? "—"} · <b>Gender:</b> ${s.gender}</div>
                          <div class="meta"><b>Parent:</b> ${s.fatherName ?? s.motherName ?? "—"}</div>
                          <div class="meta"><b>Contact:</b> ${s.mobileNumber ?? "—"}</div>
                        </div>
                        <img class="qr" src="${qr}" alt="QR" />
                      </div>
                    </div>`;
                  })
                  .join("");
                win.document.write(`<!doctype html><html><head><title>Class ID Cards — ${clsTitle}</title>
                  <style>
                    body { font-family: system-ui, -apple-system, sans-serif; margin: 20px; color: #0f172a; }
                    .bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:10px; border-bottom:1px solid #e2e8f0; }
                    .grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
                    .id-card { border: 1.5px solid #cbd5e1; border-radius: 12px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
                    .id-head { color: #fff; padding: 10px 14px; }
                    .school { font-weight: 800; font-size: 13px; letter-spacing: 0.06em; }
                    .sub { font-size: 10px; opacity: 0.85; margin-top: 2px; }
                    .id-body { display:flex; justify-content:space-between; align-items:center; gap: 12px; padding: 12px 14px; background:#fff; }
                    .name { font-weight: 800; font-size: 15px; color: #0f172a; }
                    .adm { font-family: monospace; font-size: 11.5px; color: #475569; margin-bottom: 6px; }
                    .meta { font-size: 11.5px; color: #334155; line-height: 1.45; }
                    .qr { width: 76px; height: 76px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 3px; }
                    @media print { .no-print { display: none !important; } body { margin: 0; } }
                  </style>
                </head><body>
                  <div class="bar no-print">
                    <div><b>Class ID Cards Sheet — ${clsTitle}</b> (${idCardStudents.length} cards)</div>
                    <button onclick="window.print()" style="background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">Print / Save as PDF</button>
                  </div>
                  <div class="grid">${cardsHtml}</div>
                </body></html>`);
                win.document.close();
              }}
            >
              <Icon name="download" className="h-4 w-4" /> Print Class ID Cards Sheet ({idCardStudents.length})
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Select Class">
              <Select
                aria-label="Class for ID cards"
                value={idCardClassId}
                onChange={(e) => {
                  const nextCls = e.target.value;
                  setIdCardClassId(nextCls);
                  setIdCardLoading(true);
                  const url = nextCls
                    ? `/api/students?class_id=${encodeURIComponent(nextCls)}&page_size=60`
                    : `/api/students?page_size=40`;
                  apiFetch<Paged>(url)
                    .then((r) => setIdCardStudents(r.data ?? []))
                    .catch(() => setIdCardStudents([]))
                    .finally(() => setIdCardLoading(false));
                }}
              >
                <option value="">All Classes (first 40)</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="ID Card Template Style">
              <Select
                aria-label="ID card template style"
                value={idCardStyle}
                onChange={(e) => setIdCardStyle(e.target.value as "classic" | "modern" | "compact" | "crest")}
              >
                <option value="classic">Classic Institutional</option>
                <option value="modern">Modern Gradient</option>
                <option value="compact">Compact Badge</option>
                <option value="crest">Royal Crest</option>
              </Select>
            </Field>
          </div>
          {idCardLoading ? (
            <p className="py-8 text-center text-xs text-ink-3">Loading class ID cards…</p>
          ) : idCardStudents.length === 0 ? (
            <EmptyState icon="students" title="No students in this class" hint="Select another class to generate ID cards." />
          ) : (
            <div className="grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {idCardStudents.map((s) => {
                const qr = makeQrDataUrl(`STUDENT:${s.admissionNo}|${s.fullName}`, 120);
                return (
                  <div key={s.id} className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xs">
                    <div
                      className={`px-3.5 py-2 text-white ${
                        idCardStyle === "modern"
                          ? "bg-gradient-to-r from-slate-900 to-brand-700"
                          : idCardStyle === "crest"
                          ? "bg-gradient-to-r from-purple-900 to-violet-700"
                          : idCardStyle === "compact"
                          ? "bg-teal-700"
                          : "bg-brand-800"
                      }`}
                    >
                      <p className="text-[10px] font-extrabold uppercase tracking-wider">Student Identity Card · {idCardStyle}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0 text-xs">
                        <p className="truncate font-bold text-ink">{s.fullName}</p>
                        <p className="font-mono text-[11px] text-ink-3">{s.admissionNo}</p>
                        <p className="mt-1 text-[11px] text-ink-2">
                          {s.class ? classText(s.class) : "—"} · Roll {s.rollNo ?? "—"}
                        </p>
                        {s.house && <p className="text-[11px] text-ink-3">{s.house} House</p>}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr} alt={`QR ${s.admissionNo}`} className="h-16 w-16 shrink-0 rounded-lg border border-line bg-white p-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Bulk Upload Students Modal */}
      <Modal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Upload Students (CSV)"
        subtitle="Upload a CSV file or paste spreadsheet rows to import multiple students at once."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={downloadSampleCsv}>
              <Icon name="download" className="h-4 w-4" /> Sample CSV
            </Button>
            <Button variant="soft" onClick={() => setShowBulkModal(false)}>Cancel</Button>
            <Button variant="primary" loading={bulkUploading} disabled={parsedBulkRows.length === 0 || !bulkClassId} onClick={submitBulkUpload}>
              <Icon name="upload" className="h-4 w-4" /> Import {parsedBulkRows.length} Student{parsedBulkRows.length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target Class & Section" required>
              <Select value={bulkClassId} onChange={(e) => setBulkClassId(e.target.value)} aria-label="Target Class for Bulk Upload">
                <option value="">Select Class *</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Upload CSV File" hint="Columns: admission_no, full_name, gender, roll_no, father_name, mother_name, mobile_number, house, blood_group">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setBulkCsvText(String(reader.result ?? ""));
                  reader.readAsText(file);
                }}
                className="block w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
              />
            </Field>
          </div>
          <Field label="CSV Content (editable)" hint={`${parsedBulkRows.length} valid student row(s) detected`}>
            <Textarea
              rows={5}
              value={bulkCsvText}
              onChange={(e) => setBulkCsvText(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
          {parsedBulkRows.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 font-semibold text-ink-2">
                  <tr>
                    <th className="px-3 py-2">Admission No</th>
                    <th className="px-3 py-2">Full Name</th>
                    <th className="px-3 py-2">Gender</th>
                    <th className="px-3 py-2">Roll</th>
                    <th className="px-3 py-2">House</th>
                    <th className="px-3 py-2">Parent Mobile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {parsedBulkRows.slice(0, 15).map((r, i) => (
                    <tr key={`${r.admission_no}-${i}`}>
                      <td className="px-3 py-1.5 font-mono">{r.admission_no}</td>
                      <td className="px-3 py-1.5 font-semibold text-ink">{r.full_name}</td>
                      <td className="px-3 py-1.5">{r.gender}</td>
                      <td className="px-3 py-1.5">{r.roll_no ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.house ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{r.mobile_number ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal */}
      {showForm && ( <Portal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-900/60 p-4 backdrop-blur-md max-md:items-stretch max-md:overflow-hidden max-md:!p-0"
          onClick={() => setShowForm(false)}
        >
          <div
            className="m-page relative w-full max-w-lg rounded-xl border border-line bg-white p-6 shadow-2xl max-md:h-[100dvh] max-md:max-w-none max-md:overflow-y-auto max-md:overscroll-contain max-md:rounded-none max-md:border-0 max-md:p-4 max-md:pb-0 max-md:pt-0 max-md:shadow-none"
            style={{ animation: "scale-in 0.3s var(--ease-spring) both" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6 max-md:sticky max-md:top-0 max-md:z-10 max-md:-mx-4 max-md:mb-4 max-md:justify-start max-md:gap-2 max-md:border-b max-md:border-line max-md:bg-white max-md:px-2 max-md:pb-2 max-md:pt-[calc(0.5rem+var(--m-safe-top))]">
              <button type="button" onClick={() => setShowForm(false)} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface-2 md:hidden">
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <div className="min-w-0 max-md:flex-1">
                <h3 className="text-xl font-bold text-ink">{form.id ? "Edit Student" : "Add Student"}</h3>
                <p className="text-sm text-ink-2 mt-0.5">
                  {form.id ? "Update student information" : "Register a new student in the system"}
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                aria-label="Close" className="rounded-lg p-2 max-md:hidden text-ink-3 hover:bg-surface-2 hover:text-ink-2 transition-all duration-150"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <p className="-mb-1 mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 first:mt-0 sm:col-span-2 md:hidden">Student</p>
              <Field label="Admission no" required hint={form.id ? "Cannot be changed after creation" : undefined}>
                <Input
                  value={form.admission_no}
                  onChange={(e) => setForm({ ...form, admission_no: e.target.value })}
                  placeholder="ADM-2026-0001"
                  disabled={!!form.id}
                  className={form.id ? "bg-surface-2 cursor-not-allowed" : "bg-surface-2 hover:bg-surface"}
                />
              </Field>
              <Field label="Full name" required>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: sanitizePersonName(e.target.value) })}
                  placeholder="Student name"
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <p className="-mb-1 mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 first:mt-0 sm:col-span-2 md:hidden">Parents &amp; contact</p>
              <Field label="Father's name">
                <Input
                  value={form.father_name}
                  onChange={(e) => setForm({ ...form, father_name: sanitizePersonName(e.target.value) })}
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Mother's name">
                <Input
                  value={form.mother_name}
                  onChange={(e) => setForm({ ...form, mother_name: sanitizePersonName(e.target.value) })}
                  className="bg-surface-2 hover:bg-white"
                />
              </Field>
              <Field label="Mobile">
                <Input
                  type="tel"
                  value={form.mobile_number}
                  onChange={(e) => setForm({ ...form, mobile_number: sanitizePhone(e.target.value) })}
                  maxLength={10}
                  inputMode="numeric"
                  placeholder="10-digit mobile number"
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
              <p className="-mb-1 mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 first:mt-0 sm:col-span-2 md:hidden">Gender, class &amp; status</p>
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
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-line max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:bg-white max-md:px-4 max-md:pb-[calc(0.875rem+var(--m-safe-bottom))] max-md:[&>*]:flex-1">
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
