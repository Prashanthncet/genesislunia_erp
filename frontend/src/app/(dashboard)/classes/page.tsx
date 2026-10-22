"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { hasRole, R, ROLE, useMe } from "@/lib/auth";
import { TableView } from "@/components/TableView";
import {
  Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Modal, PageHeader,
  ProgressBar, Reveal, Select, SkeletonRows, StatCard, useToast,
} from "@/components/ui";
import {
  CardBody, CardEmpty, CardFooter, CardGrid, CardTitle, Chip, Meter, Metric, Monogram, RecordCard, Ring, StatusPill,
  initials, statusTone, toneClasses, toneFor, type Tone,
} from "@/components/RecordCard";

/* ── API shapes ───────────────────────────────────────────────── */

type ClassRow = {
  id: string;
  name: string;
  section: string | null;
  createdAt: string;
  _count?: { students: number };
  classTeacher?: { id: string; name: string } | null;
};

type StaffLite = { id: string; name: string; role: string; isActive: boolean };

type Student = {
  id: string;
  admissionNo: string;
  fullName: string;
  rollNo: string | null;
  gender: string | null;
  house: string | null;
  status: string;
};

type ClassDetail = ClassRow & { students: Student[] };

type AttendanceRow = {
  class_id: string;
  class_name: string;
  section: string | null;
  attendance_pct: number | null;
  total_records: number;
};

type SortKey = "name" | "strength" | "attendance";

const HOUSES = ["Blue", "Green", "Red", "Yellow"];

function classLabel(c: Pick<ClassRow, "name" | "section">): string {
  return c.section ? `${c.name} · ${c.section}` : c.name;
}

/** Attendance % → status tone (same thresholds as the table badge). */
function attendanceTone(pct: number | null): Tone {
  if (pct === null) return "slate";
  return pct >= 90 ? "ok" : pct >= 75 ? "warn" : "danger";
}

/** House colours: named houses get their own colour, anything else a stable category tone. */
function houseTone(house: string): Tone {
  const h = house.trim().toLowerCase();
  if (h === "red") return "danger";
  if (h === "blue") return "blue";
  if (h === "green") return "ok";
  if (h === "yellow") return "gold";
  return toneFor(house);
}

/** Short code for a class monogram: "Class 8" + "A" → "8A". */
function classCode(c: Pick<ClassRow, "name" | "section">): string {
  const num = c.name.match(/\d+/)?.[0];
  const base = num ?? initials(c.name);
  return `${base}${c.section ? c.section.slice(0, 2).toUpperCase() : ""}`.slice(0, 4);
}

export default function ClassesPage() {
  const toast = useToast();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const { me, loading: meLoading } = useMe();
  // Mirrors the backend: classes are read by every staff role, written by admins + principal.
  const canRead = hasRole(me, R.STAFF);
  const canManage = hasRole(me, [...R.ADMINS, ROLE.PRINCIPAL]);
  const canOpenStudent = hasRole(me, R.STUDENT_READ);
  // Same rule as GET /reports/attendance (R.REPORTS + attendance markers).
  const canSeeAttendance = hasRole(me, [...R.REPORTS, ...R.ATTENDANCE_MARK]);

  // create / edit
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [form, setForm] = useState({ name: "", section: "", class_teacher_id: "" });
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // roster
  const [rosterOf, setRosterOf] = useState<ClassRow | null>(null);
  const [roster, setRoster] = useState<ClassDetail | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");

  // delete
  const [deleting, setDeleting] = useState<ClassRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await apiFetch<ClassRow[]>("/api/classes");
      setClasses(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load classes");
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    load();
    // Attendance is a nice-to-have column; a failure must not break the page.
    if (!canSeeAttendance) return;
    apiFetch<AttendanceRow[]>("/api/reports/attendance")
      .then((rows) => setAttendance(Array.isArray(rows) ? rows : []))
      .catch(() => setAttendance([]));
  }, [load, canRead, canSeeAttendance]);

  // Class-teacher picker: active staff of this school (admins + principal can read the directory).
  useEffect(() => {
    if (!canManage) return;
    apiFetch<StaffLite[]>("/api/staff?active=true")
      .then((rows) => setStaff(Array.isArray(rows) ? rows : []))
      .catch(() => setStaff([]));
  }, [canManage]);

  const strengthOf = (c: ClassRow) => c._count?.students ?? 0;

  const attendanceOf = (c: ClassRow) => {
    const row = attendance.find((a) => a.class_id === c.id);
    return row?.attendance_pct ?? null;
  };

  /* ── Derived KPIs ───────────────────────────────────────────── */

  const totalStudents = classes.reduce((sum, c) => sum + strengthOf(c), 0);
  const avgSize = classes.length ? Math.round((totalStudents / classes.length) * 10) / 10 : 0;
  const largest = classes.reduce<ClassRow | null>(
    (best, c) => (!best || strengthOf(c) > strengthOf(best) ? c : best), null,
  );
  const maxStrength = largest ? strengthOf(largest) : 1;
  const emptyClasses = classes.filter((c) => strengthOf(c) === 0).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? classes.filter((c) => classLabel(c).toLowerCase().includes(q))
      : classes;
    return [...filtered].sort((a, b) => {
      if (sort === "strength") return strengthOf(b) - strengthOf(a);
      if (sort === "attendance") return (attendanceOf(b) ?? -1) - (attendanceOf(a) ?? -1);
      return classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, query, sort, attendance]);

  const uniqueNames = useMemo(
    () => Array.from(new Set(classes.map((c) => c.name))).sort(
      (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    ),
    [classes],
  );

  /* ── Actions ────────────────────────────────────────────────── */

  function openCreate() {
    setEditing(null);
    setForm({ name: "", section: "", class_teacher_id: "" });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(c: ClassRow) {
    setEditing(c);
    setForm({ name: c.name, section: c.section ?? "", class_teacher_id: c.classTeacher?.id ?? "" });
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError("Class name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const body = JSON.stringify({
      name: form.name.trim(),
      section: form.section.trim() || undefined,
      // "" clears the class teacher on edit; omitted on create when none is chosen.
      class_teacher_id: editing ? form.class_teacher_id : form.class_teacher_id || undefined,
    });
    try {
      if (editing) {
        await apiFetch(`/api/classes/${editing.id}`, { method: "PUT", body });
        toast.push(`${classLabel({ name: form.name.trim(), section: form.section.trim() })} updated`);
      } else {
        await apiFetch("/api/classes", { method: "POST", body });
        toast.push(`${form.name.trim()} created`);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setFormError(message);
      toast.push(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function openRoster(c: ClassRow) {
    setRosterOf(c);
    setRoster(null);
    setRosterQuery("");
    setRosterLoading(true);
    try {
      const detail = await apiFetch<ClassDetail>(`/api/classes/${c.id}`);
      setRoster(detail);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not load the roster", "error");
      setRosterOf(null);
    } finally {
      setRosterLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await apiFetch(`/api/classes/${deleting.id}`, { method: "DELETE" });
      toast.push(`${classLabel(deleting)} deleted`);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const rosterStudents = roster
    ? roster.students.filter((s) => {
        const q = rosterQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.admissionNo.toLowerCase().includes(q) ||
          (s.rollNo ?? "").toLowerCase().includes(q)
        );
      })
    : [];

  // Class summary tile: a big class+section monogram, strength as the hero number and an attendance ring (skeleton tiles while nothing is loaded yet).
  const summaryCards = (
    <CardGrid
      min="15rem"
      empty={
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(15rem, 100%), 1fr))" }} aria-busy="true" aria-label="Loading classes">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-32 w-full rounded-xl" />)}
        </div>
      }
    >
      {visible.map((c) => {
        const pct = attendanceOf(c);
        const tone = attendanceTone(pct);
        return (
          <RecordCard key={c.id}>
            <CardBody className="flex-row items-center gap-4">
              <Monogram text={classCode(c)} tone={toneFor(c.name)} size="lg" solid />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink-2">{classLabel(c)}</p>
                <p className="tnum text-[28px] font-bold leading-none text-ink">{strengthOf(c)}</p>
                <p className="mt-1 text-[11.5px] text-ink-3">students</p>
              </div>
              <Ring value={pct ?? 0} tone={tone} size={56} label={pct === null ? "No attendance records" : `Attendance ${pct.toFixed(1)}%`}>
                {pct === null ? "—" : `${Math.round(pct)}%`}
              </Ring>
            </CardBody>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  // Class card: a tinted band names the class, strength + attendance follow, the meter shows size against the largest class.
  const classCards = (
    <CardGrid min="17rem" empty={<CardEmpty title="No classes match that search" hint={`Nothing matched “${query}”.`} icon="search" />}>
      {visible.map((c) => {
        const pct = attendanceOf(c);
        const strength = strengthOf(c);
        const share = maxStrength ? Math.round((strength / maxStrength) * 100) : 0;
        const band = toneClasses(toneFor(c.name));
        return (
          <RecordCard key={c.id}>
            <div className={`flex items-center justify-between gap-3 px-4 py-3.5 ${band.soft}`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon name="layers" className={`h-5 w-5 shrink-0 ${band.text}`} />
                <h3 className={`truncate text-[17px] font-bold leading-tight ${band.text}`}>{c.name}</h3>
              </div>
              {c.section ? <Chip tone="slate">Section {c.section}</Chip> : <span className="text-[11.5px] text-ink-3">No section</span>}
            </div>
            <CardBody>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Strength" value={strength} hint={strength === 1 ? "student" : "students"} size="lg" />
                <Metric
                  label="Attendance"
                  value={pct === null ? "No records" : `${pct.toFixed(1)}%`}
                  tone={pct === null ? undefined : attendanceTone(pct)}
                  size="lg"
                  align="right"
                />
              </div>
              <Meter value={strength} max={maxStrength} tone="navy" label="Share of largest class" caption={`${share}%`} />
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <Icon name="user" className="h-3.5 w-3.5 text-ink-3" />
                Class teacher: {c.classTeacher ? <strong className="text-ink">{c.classTeacher.name}</strong> : <span className="text-ink-3">not assigned</span>}
              </p>
            </CardBody>
            <CardFooter>
              <Button size="sm" onClick={() => openRoster(c)}>
                <Icon name="eye" className="h-3.5 w-3.5" />
                Roster
              </Button>
              {canManage && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)} aria-label={`Edit ${classLabel(c)}`}>
                    <Icon name="edit" className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setDeleteError(null); setDeleting(c); }}
                    aria-label={`Delete ${classLabel(c)}`}
                    className="!text-danger hover:!bg-danger-soft"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </CardFooter>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  // Roster badge: a compact person card — initials, name, roll, house colour and status at a glance.
  const rosterCards = (
    <CardGrid min="13rem" empty={<CardEmpty title="No matching students" hint={`No students match “${rosterQuery}”.`} icon="students" />}>
      {rosterStudents.map((s) => (
        <RecordCard key={s.id} rail={s.house ? houseTone(s.house) : undefined}>
          <CardBody className="gap-2.5 p-3.5">
            <CardTitle
              lead={<Monogram text={initials(s.fullName)} tone={s.house ? houseTone(s.house) : "slate"} shape="circle" size="sm" />}
              title={s.fullName}
              subtitle={<span className="font-mono">{s.admissionNo}</span>}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip icon="user">Roll {s.rollNo ?? "—"}</Chip>
              {s.house ? <Chip icon="flag" tone={houseTone(s.house)}>{s.house}</Chip> : <Chip>No house</Chip>}
              <span className="ml-auto">
                <StatusPill status={s.status} tone={s.status === "Active" ? "ok" : statusTone(s.status)} />
              </span>
            </div>
          </CardBody>
        </RecordCard>
      ))}
    </CardGrid>
  );

  if (!meLoading && me && !canRead) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="Classes are available to school staff." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon="layers"
        eyebrow="Academics"
        title="Classes & Sections"
        subtitle="Every class and section in this branch, with live strength and attendance coverage."
        actions={
          <>
            <Button onClick={load} disabled={loading}>
              <Icon name="refresh" className="h-4 w-4" />
              Refresh
            </Button>
            {canManage && (
              <Button variant="primary" onClick={openCreate}>
                <Icon name="plus" className="h-4 w-4" />
                New class
              </Button>
            )}
          </>
        }
      />

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Classes" value={loading ? null : classes.length} icon="layers" tone="brand" delay={0} />
        <StatCard label="Enrolled students" value={loading ? null : totalStudents} icon="students" tone="emerald" delay={60} />
        <StatCard
          label="Average class size"
          value={loading ? null : avgSize}
          decimals={1}
          icon="activity"
          tone="violet"
          delay={120}
        />
        <StatCard
          label="Empty classes"
          value={loading ? null : emptyClasses}
          icon="alert"
          tone={emptyClasses > 0 ? "amber" : "teal"}
          hint={emptyClasses > 0 ? "No students assigned" : "All classes have students"}
          delay={180}
        />
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <Card delay={220}>
        <CardHead
          icon="layers"
          title="Class directory"
          subtitle={loading ? "Loading…" : `${visible.length} of ${classes.length} shown`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search class…"
                aria-label="Search classes"
                className="!w-44"
              />
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort classes by"
                className="!w-40"
              >
                <option value="name">Sort: Name</option>
                <option value="strength">Sort: Strength</option>
                <option value="attendance">Sort: Attendance</option>
              </Select>
            </div>
          }
        />

        {loadError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load classes"
            hint={loadError}
            action={<Button variant="primary" onClick={load}>Try again</Button>}
          />
        ) : loading ? (
          <div className="table-wrap">
            <TableView id="t1" cards={summaryCards}>
            <table className="data-table">
              <thead>
                <tr><th>Class</th><th>Section</th><th>Class teacher</th><th>Strength</th><th>Attendance</th><th /></tr>
              </thead>
              <SkeletonRows rows={4} cols={6} />
            </table>
            </TableView>
          </div>
        ) : classes.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No classes yet"
            hint="Create the first class for this branch to start enrolling students and building timetables."
            action={canManage ? <Button variant="primary" onClick={openCreate}>Create a class</Button> : undefined}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search"
            title="No classes match that search"
            hint={`Nothing matched “${query}”. Clear the search to see all ${classes.length} classes.`}
            action={<Button onClick={() => setQuery("")}>Clear search</Button>}
          />
        ) : (
          <div className="table-wrap">
            <TableView id="t2" cards={classCards}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Class teacher</th>
                  <th>Strength</th>
                  <th className="w-[22%]">Share of largest class</th>
                  <th>Attendance</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const pct = attendanceOf(c);
                  const strength = strengthOf(c);
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                            <Icon name="layers" className="h-4 w-4" />
                          </span>
                          <strong>{c.name}</strong>
                        </span>
                      </td>
                      <td>{c.section ? <Badge tone="slate">{c.section}</Badge> : <span className="text-ink-3">—</span>}</td>
                      <td>{c.classTeacher ? c.classTeacher.name : <span className="text-ink-3">Not assigned</span>}</td>
                      <td>
                        <span className="font-semibold text-ink">{strength}</span>
                        <span className="text-ink-3"> students</span>
                      </td>
                      <td>
                        <span className="flex items-center gap-3">
                          <ProgressBar
                            value={maxStrength ? (strength / maxStrength) * 100 : 0}
                            tone="violet"
                            className="flex-1"
                            label={`${c.name} strength`}
                          />
                          <span className="w-10 shrink-0 text-right text-[11.5px] font-semibold text-ink-3">
                            {maxStrength ? Math.round((strength / maxStrength) * 100) : 0}%
                          </span>
                        </span>
                      </td>
                      <td>
                        {pct === null ? (
                          <span className="text-ink-3">No records</span>
                        ) : (
                          <Badge tone={pct >= 90 ? "emerald" : pct >= 75 ? "amber" : "rose"}>
                            {pct.toFixed(1)}%
                          </Badge>
                        )}
                      </td>
                      <td>
                        <span className="flex items-center justify-end gap-1.5">
                          <Button size="sm" onClick={() => openRoster(c)}>
                            <Icon name="eye" className="h-3.5 w-3.5" />
                            Roster
                          </Button>
                          {canManage && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(c)} aria-label={`Edit ${classLabel(c)}`}>
                                <Icon name="edit" className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setDeleteError(null); setDeleting(c); }}
                                aria-label={`Delete ${classLabel(c)}`}
                                className="!text-danger hover:!bg-danger-soft"
                              >
                                <Icon name="trash" className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </TableView>
          </div>
        )}
      </Card>

      {!canManage && !loading && classes.length > 0 && (
        <Reveal delay={260}>
          <p className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-2">
            <Icon name="lock" className="h-4 w-4 shrink-0 text-ink-3" />
            You have read-only access to classes. Only a Principal or Administrator can add, edit or remove them.
          </p>
        </Reveal>
      )}

      {/* ── Create / edit ────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${classLabel(editing)}` : "New class"}
        subtitle={editing ? "Update the name, section or class teacher." : "Classes group students for attendance, timetable and exams."}
        size="sm"
        footer={
          <>
            <Button onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submitForm} loading={saving}>
              {editing ? "Save changes" : "Create class"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Class name" required hint="For example “Class 8” or “Class 12”." error={formError ?? undefined}>
            <Input
              value={form.name}
              list="class-names"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Class 8"
              aria-invalid={formError ? "true" : undefined}
              autoFocus
            />
          </Field>
          <datalist id="class-names">
            {uniqueNames.map((n) => <option key={n} value={n} />)}
          </datalist>

          <Field label="Section" hint="Optional. Use it to split a year group, e.g. A, B or Science.">
            <Input
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
              placeholder="A"
            />
          </Field>

          <Field label="Class teacher" hint="May mark this class's attendance even without a timetable period in it.">
            <Select
              aria-label="Class teacher"
              value={form.class_teacher_id}
              onChange={(e) => setForm({ ...form, class_teacher_id: e.target.value })}
            >
              <option value="">Not assigned</option>
              {editing?.classTeacher && !staff.some((t) => t.id === editing.classTeacher!.id) && (
                <option value={editing.classTeacher.id}>{editing.classTeacher.name}</option>
              )}
              {staff.map((t) => <option key={t.id} value={t.id}>{t.name}{t.role ? ` — ${t.role}` : ""}</option>)}
            </Select>
          </Field>

          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[12px] leading-relaxed text-brand-800">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            A class with the same name and section already in this branch will be rejected.
          </p>
        </div>
      </Modal>

      {/* ── Roster ───────────────────────────────────────────────── */}
      <Modal
        open={rosterOf !== null}
        onClose={() => setRosterOf(null)}
        title={rosterOf ? `${classLabel(rosterOf)} roster` : "Roster"}
        subtitle={
          roster
            ? `${roster.students.length} student${roster.students.length === 1 ? "" : "s"} enrolled`
            : "Loading…"
        }
        footer={<Button onClick={() => setRosterOf(null)}>Close</Button>}
        size="lg"
      >
        {rosterLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : !roster || roster.students.length === 0 ? (
          <EmptyState
            icon="students"
            title="No students in this class"
            hint="Assign students to this class from the Students directory."
          />
        ) : (
          <div className="space-y-3">
            {/* At-a-glance strip: headcount, active, and how the class splits across houses. */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
              <Chip icon="students" tone="navy">{roster.students.length} enrolled</Chip>
              <Chip icon="check" tone="ok">
                {roster.students.filter((s) => s.status === "Active").length} active
              </Chip>
              <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden />
              {Object.entries(
                roster.students.reduce<Record<string, number>>((acc, s) => {
                  const h = s.house ?? "No house";
                  acc[h] = (acc[h] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([house, n]) => (
                <Chip key={house} icon="flag" tone={house === "No house" ? "slate" : houseTone(house)}>
                  {house} · {n}
                </Chip>
              ))}
            </div>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input
                value={rosterQuery}
                onChange={(e) => setRosterQuery(e.target.value)}
                placeholder="Search by name, admission no. or roll no…"
                aria-label="Search students in this class"
                className="!pl-9"
              />
            </div>

            {rosterStudents.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-ink-3">
                No students match “{rosterQuery}”.
              </p>
            ) : (
              <>
                <div className="table-wrap rounded-xl border border-line">
                  <TableView id="t3" cards={rosterCards}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Roll</th>
                        <th>Student</th>
                        <th>Admission no.</th>
                        <th>House</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterStudents.map((s) => (
                        <tr key={s.id}>
                          <td className="whitespace-nowrap font-mono text-[12.5px] text-ink-2">{s.rollNo ?? "—"}</td>
                          <td>
                            <div className="flex items-center gap-2.5 whitespace-nowrap">
                              <Monogram text={initials(s.fullName)} tone={s.house ? houseTone(s.house) : "slate"} shape="circle" size="sm" />
                              {canOpenStudent
                                ? <Link href={`/students/${s.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{s.fullName}</Link>
                                : <strong>{s.fullName}</strong>}
                            </div>
                          </td>
                          <td className="whitespace-nowrap font-mono text-[12.5px] text-ink-3">{s.admissionNo}</td>
                          <td>
                            {s.house ? (
                              <Chip icon="flag" tone={houseTone(s.house)}>{s.house}</Chip>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                          </td>
                          <td>
                            <Badge tone={s.status === "Active" ? "emerald" : "slate"}>{s.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </TableView>
                </div>
                {rosterStudents.length > 12 && (
                  <p className="text-center text-[11.5px] text-ink-3">
                    Showing all {rosterStudents.length} students — scroll inside the table.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Delete ───────────────────────────────────────────────── */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete class"
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Keep class</Button>
            <Button variant="danger" onClick={confirmDelete}>
              <Icon name="trash" className="h-4 w-4" />
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink-2">
            You are about to delete{" "}
            <strong className="text-ink">{deleting ? classLabel(deleting) : ""}</strong>. This cannot
            be undone.
          </p>
          {deleting && strengthOf(deleting) > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              This class still has {strengthOf(deleting)} enrolled student
              {strengthOf(deleting) === 1 ? "" : "s"}. Move them to another class first — the server
              will refuse the delete otherwise.
            </p>
          )}
          {deleteError && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {deleteError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
