"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, ROLE, useMe } from "@/lib/auth";
import {
  Badge, Button, EmptyState, Field, Icon, Input, PageHeader, ProgressBar, Reveal, Select, Textarea, useToast,
} from "@/components/ui";
import { TableView } from "@/components/TableView";
import { CardEmpty, CardGrid, Chip, RecordCard, toneClasses, toneFor, type Tone } from "@/components/RecordCard";
import { LessonPlanPdfActions, checkLessonPdf, fmtSize, uploadLessonPdf } from "@/components/academics/LessonPlanPdf";
import { NoticeComposer } from "@/components/notices/NoticeComposer";
import { confirmAction } from "@/components/confirm";

type Subject = { id: string; name: string; code: string; level: string };
type Syllabus = { id: string; title: string; description: string | null; classId: string; subjectId: string; subject?: { name: string }; class?: { name: string; section: string | null }; _count?: { lessonPlans: number } };
type LessonPlan = { id: string; topic: string; date: string; status: string; teacherId: string; attachmentName?: string | null; attachmentSize?: number | null; syllabus?: { title: string; subject?: { name: string }; class?: { name: string; section: string | null } }; teacher?: { id: string; name: string } | null };
type Assignment = { id: string; title: string; description: string | null; dueDate: string | null; teacherId: string; subject?: { name: string }; class?: { name: string; section: string | null }; teacher?: { id: string; name: string } | null };
type ClassItem = { id: string; name: string; section: string | null };
type Teacher = { id: string; name: string; subjects: string | null };
type Progress = {
  overall: { units: number; planned: number; completed: number; pct: number | null };
  by_subject: { class_id: string; class_name: string; subject_id: string; subject_name: string; units: number; planned: number; completed: number; pct: number | null }[];
  units: { syllabus_id: string; title: string; class_name: string; subject_name: string; planned: number; completed: number; in_progress: number; pct: number | null }[];
};

type Tab = "subjects" | "syllabus" | "lesson-plans" | "assignments" | "progress";
const STATUSES = ["Planned", "In Progress", "Completed"] as const;
const className = (c?: { name: string; section: string | null } | null) => (c ? `${c.name}${c.section ? ` ${c.section}` : ""}` : "—");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const errText = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

export default function AcademicsPage() {
  const { me } = useMe();
  const toast = useToast();
  const portal = isPortal(me);
  const canSetup = hasRole(me, R.ACADEMIC_SETUP);
  const canTeach = hasRole(me, R.TEACHING);
  const isTeacher = me?.role === ROLE.TEACHER;
  const ownStaffId = me?.staff?.id ?? null;
  const canRead = !!me && (hasRole(me, R.STAFF) || portal);

  const [tab, setTab] = useState<Tab>("syllabus");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [syllabus, setSyllabus] = useState<Syllabus[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressClass, setProgressClass] = useState("");
  const [busy, setBusy] = useState(false);
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [lessonFileKey, setLessonFileKey] = useState(0); // remounts the file input to clear it
  const [notifyOpen, setNotifyOpen] = useState(false);

  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", level: "Secondary" });
  const [syllabusForm, setSyllabusForm] = useState({ class_id: "", subject_id: "", title: "", description: "" });
  const [lessonForm, setLessonForm] = useState({ syllabus_id: "", teacher_id: "", topic: "", date: "", status: "Planned" });
  const [assignmentForm, setAssignmentForm] = useState({ class_id: "", subject_id: "", teacher_id: "", title: "", description: "", due_date: "" });

  const ok = (m: string) => toast.push(m, "success");
  const fail = (e: unknown) => toast.push(errText(e), "error");

  const loadAll = useCallback(async () => {
    if (!me) return;
    try {
      const staff = hasRole(me, R.STAFF);
      const [sub, sy, asg, cls, lp, tch] = await Promise.all([
        apiFetch<Subject[]>("/api/academics/subjects"),
        apiFetch<Syllabus[]>("/api/academics/syllabus"),
        apiFetch<Assignment[]>("/api/academics/assignments"),
        staff ? apiFetch<ClassItem[]>("/api/classes").catch(() => [] as ClassItem[]) : Promise.resolve([] as ClassItem[]),
        staff ? apiFetch<LessonPlan[]>("/api/academics/lesson-plans") : Promise.resolve([] as LessonPlan[]),
        hasRole(me, R.TEACHING) ? apiFetch<Teacher[]>("/api/academics/teachers") : Promise.resolve([] as Teacher[]),
      ]);
      setSubjects(sub); setSyllabus(sy); setAssignments(asg); setClasses(cls); setLessonPlans(lp); setTeachers(tch);
    } catch (e) { fail(e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const loadProgress = useCallback(async () => {
    if (!me) return;
    try {
      setProgress(await apiFetch<Progress>(`/api/academics/syllabus/progress${progressClass ? `?class_id=${encodeURIComponent(progressClass)}` : ""}`));
    } catch (e) { fail(e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, progressClass]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === "progress") loadProgress(); }, [tab, loadProgress]);
  // A teacher always posts as themselves: preselect and lock the dropdown.
  useEffect(() => {
    if (isTeacher && ownStaffId) {
      setLessonForm((f) => ({ ...f, teacher_id: ownStaffId }));
      setAssignmentForm((f) => ({ ...f, teacher_id: ownStaffId }));
    }
  }, [isTeacher, ownStaffId]);

  const mine = (teacherId: string) => !isTeacher || teacherId === ownStaffId;

  const send = async (path: string, method: string, body: object | undefined, success: string, after?: () => void) => {
    setBusy(true);
    try {
      await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      after?.();
      await loadAll();
      if (tab === "progress") await loadProgress();
      ok(success);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const clean = <T extends Record<string, string>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "")) as Partial<T>;

  const addSubject = () => {
    if (!subjectForm.name || !subjectForm.code) return toast.push("Name and code are required", "error");
    send("/api/academics/subjects", "POST", subjectForm, "Subject added", () => setSubjectForm({ name: "", code: "", level: "Secondary" }));
  };
  const addSyllabus = () => {
    if (!syllabusForm.class_id || !syllabusForm.subject_id || !syllabusForm.title) return toast.push("Class, subject and title are required", "error");
    send("/api/academics/syllabus", "POST", clean(syllabusForm), "Syllabus unit added", () => setSyllabusForm({ class_id: "", subject_id: "", title: "", description: "" }));
  };
  const addLessonPlan = () => {
    if (!lessonForm.syllabus_id || !lessonForm.topic || !lessonForm.date) return toast.push("Syllabus unit, topic and date are required", "error");
    if (!lessonForm.teacher_id && !ownStaffId) return toast.push("Choose a teacher", "error");
    if (lessonFile) {
      const err = checkLessonPdf(lessonFile);
      if (err) return toast.push(err, "error");
    }
    void (async () => {
      setBusy(true);
      try {
        const created = await apiFetch<{ id: string }>("/api/academics/lesson-plans", { method: "POST", body: JSON.stringify(clean(lessonForm)) });
        let note = "Lesson plan created";
        if (lessonFile) {
          try {
            await uploadLessonPdf(created.id, lessonFile);
            note = "Lesson plan created with its PDF";
          } catch (e) {
            toast.push(`Plan saved, but the PDF was not attached: ${errText(e)}. Use "Attach PDF" on the plan to retry.`, "error");
          }
        }
        setLessonForm((f) => ({ ...f, syllabus_id: "", topic: "", date: "", status: "Planned" }));
        setLessonFile(null);
        setLessonFileKey((k) => k + 1);
        await loadAll();
        ok(note);
      } catch (e) { fail(e); } finally { setBusy(false); }
    })();
  };
  const addAssignment = () => {
    if (!assignmentForm.class_id || !assignmentForm.subject_id || !assignmentForm.title || !assignmentForm.due_date) {
      return toast.push("Class, subject, title and due date are required", "error");
    }
    if (!assignmentForm.teacher_id && !ownStaffId) return toast.push("Choose a teacher", "error");
    send("/api/academics/assignments", "POST", clean(assignmentForm), "Assignment published",
      () => setAssignmentForm((f) => ({ ...f, class_id: "", subject_id: "", title: "", description: "", due_date: "" })));
  };
  const confirmDel = (what: string) => confirmAction({ title: `Delete ${what}?`, text: "This cannot be undone.", confirmText: "Delete", tone: "danger" });

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string; icon: string }[] = [
      { id: "subjects", label: "Subjects", icon: "book" },
      { id: "syllabus", label: "Syllabus", icon: "file" },
    ];
    if (!portal) t.push({ id: "lesson-plans", label: "Lesson Plans", icon: "clipboard" });
    t.push({ id: "assignments", label: "Assignments", icon: "academics" }, { id: "progress", label: "Progress", icon: "activity" });
    return t;
  }, [portal]);

  if (me && !canRead) {
    return <EmptyState icon="lock" title="You don't have access to this page" hint="Academics is available to staff, parents and students." />;
  }

  const levelTone = (level: string): Tone => (level === "Primary" ? "teal" : level === "Secondary" ? "sky" : "gold");
  const subjectCards = (
    <CardGrid min="14rem" empty={<CardEmpty title="No subjects yet" hint="Add a subject to start building the curriculum." icon="book" />}>
      {subjects.map((s) => {
        const t = toneClasses(toneFor(s.code));
        return (
          <RecordCard key={s.id}>
            <div className="flex items-start gap-3 p-4">
              <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-xl ${t.solid} font-mono text-[16px] font-bold tracking-tight text-white shadow-soft`} aria-hidden>{s.code}</span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{s.name}</h3>
                <p className="mt-0.5 font-mono text-[11.5px] text-ink-3">{s.code}</p>
                <div className="mt-2"><Chip tone={levelTone(s.level)} icon="layers">{s.level}</Chip></div>
              </div>
              {canSetup && (
                <button onClick={async () => { if (await confirmDel(s.name)) await send(`/api/academics/subjects/${s.id}`, "DELETE", undefined, `${s.name} deleted`); }} aria-label={`Delete ${s.name}`} className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-3 max-md:grid max-md:h-10 max-md:w-10 max-md:place-items-center max-md:p-2.5 transition-colors hover:bg-danger-soft hover:text-danger">
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              )}
            </div>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  const teacherSelect = (value: string, onChange: (v: string) => void) => (
    <Field label="Teacher" required hint={isTeacher ? "Teachers always post as themselves" : undefined}>
      <Select aria-label="Teacher" value={value} disabled={isTeacher} onChange={(e) => onChange(e.target.value)}>
        {!isTeacher && <option value="">{ownStaffId ? "Me" : "Select teacher"}</option>}
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.subjects ? ` · ${t.subjects}` : ""}</option>)}
      </Select>
    </Field>
  );

  const formCard = (title: string, children: React.ReactNode) => (
    <div className="card p-6 max-md:p-4">
      <h3 className="mb-4 font-semibold text-ink">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="academics"
          title="Academics"
          subtitle={portal ? "Syllabus and assignments for your class" : "Subjects, syllabus, lesson plans, assignments and syllabus progress"}
          actions={canTeach && !portal ? (
            <Button type="button" variant="primary" onClick={() => setNotifyOpen(true)}>
              <Icon name="bell" className="h-4 w-4" /> Notify class
            </Button>
          ) : undefined}
        />
      </Reveal>

      <div className="flex items-center gap-2 overflow-x-auto max-md:gap-1.5 max-md:[scrollbar-width:none]" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 max-md:min-h-11 max-md:shrink-0 max-md:px-3.5 ${tab === t.id ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-100" : "text-ink-2 hover:bg-surface-2"}`}>
            <Icon name={t.icon} className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-md:gap-3">
        {[
          { label: "Subjects", value: subjects.length, icon: "book" },
          { label: "Syllabus units", value: syllabus.length, icon: "file" },
          { label: "Lesson plans", value: portal ? null : lessonPlans.length, icon: "clipboard" },
          { label: "Assignments", value: assignments.length, icon: "academics" },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 60}>
            <div className="card p-5 max-md:h-full max-md:p-4">
              <div className="mb-2 flex items-center gap-2 text-ink-3"><Icon name={s.icon} className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">{s.label}</span></div>
              <p className="tnum text-3xl font-bold text-brand-700 max-md:text-2xl">{s.value ?? "—"}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "subjects" && (
          <div className={`grid grid-cols-1 gap-6 max-md:gap-4 ${canSetup ? "lg:grid-cols-2" : ""}`}>
            {canSetup && formCard("Add subject", <>
              <Field label="Subject name" required><Input value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="e.g. Mathematics" /></Field>
              <div className="grid grid-cols-2 gap-3 max-md:[&>*]:min-w-0">
                <Field label="Code" required><Input value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} placeholder="e.g. MAT" /></Field>
                <Field label="Level"><Input value={subjectForm.level} onChange={(e) => setSubjectForm({ ...subjectForm, level: e.target.value })} /></Field>
              </div>
              <Button variant="primary" onClick={addSubject} loading={busy} className="w-full"><Icon name="plus" className="h-4 w-4" /> Add subject</Button>
            </>)}
            <div className="card overflow-hidden">
              <TableView id="subjects" title="Name" cards={subjectCards}>
                <table className="w-full text-sm">
                  <thead className="table-head"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Level</th>{canSetup && <th className="px-4 py-3 text-right">Action</th>}</tr></thead>
                  <tbody>
                    {subjects.map((s) => (
                      <tr key={s.id} className="row-hover border-t border-line">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-2">{s.code}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{s.name}</td>
                        <td className="px-4 py-3"><Badge tone="sky">{s.level}</Badge></td>
                        {canSetup && <td className="px-4 py-3 text-right"><button aria-label={`Delete ${s.name}`} onClick={async () => { if (await confirmDel(s.name)) await send(`/api/academics/subjects/${s.id}`, "DELETE", undefined, `${s.name} deleted`); }} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft max-md:grid max-md:h-10 max-md:w-10 max-md:place-items-center max-md:p-3"><Icon name="trash" className="h-4 w-4" /></button></td>}
                      </tr>
                    ))}
                    {subjects.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-3">No subjects yet</td></tr>}
                  </tbody>
                </table>
              </TableView>
            </div>
          </div>
        )}

        {tab === "syllabus" && (
          <div className={`grid grid-cols-1 gap-6 max-md:gap-4 ${canSetup ? "lg:grid-cols-2" : ""}`}>
            {canSetup && formCard("Add syllabus unit", <>
              <div className="grid grid-cols-2 gap-3 max-md:[&>*]:min-w-0">
                <Field label="Class" required><Select aria-label="Class" value={syllabusForm.class_id} onChange={(e) => setSyllabusForm({ ...syllabusForm, class_id: e.target.value })}><option value="">Select class</option>{classes.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
                <Field label="Subject" required><Select aria-label="Subject" value={syllabusForm.subject_id} onChange={(e) => setSyllabusForm({ ...syllabusForm, subject_id: e.target.value })}><option value="">Select subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              </div>
              <Field label="Unit title" required><Input value={syllabusForm.title} onChange={(e) => setSyllabusForm({ ...syllabusForm, title: e.target.value })} /></Field>
              <Field label="Description"><Textarea value={syllabusForm.description} onChange={(e) => setSyllabusForm({ ...syllabusForm, description: e.target.value })} /></Field>
              <Button variant="primary" onClick={addSyllabus} loading={busy} className="w-full"><Icon name="plus" className="h-4 w-4" /> Add unit</Button>
            </>)}
            <div className="card max-h-[560px] overflow-y-auto max-md:max-h-none max-md:overflow-visible">
              {syllabus.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border-b border-line p-4 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{s.title}</p>
                    <p className="text-xs text-ink-2">{s.subject?.name} · {className(s.class)}{s._count ? ` · ${s._count.lessonPlans} plan(s)` : ""}</p>
                    {s.description && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{s.description}</p>}
                  </div>
                  {canSetup && (
                    <button aria-label={`Delete ${s.title}`} onClick={async () => { if (await confirmDel(s.title)) await send(`/api/academics/syllabus/${s.id}`, "DELETE", undefined, `${s.title} deleted`); }} className="rounded-lg p-2 text-danger hover:bg-danger-soft max-md:p-3"><Icon name="trash" className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {syllabus.length === 0 && <EmptyState icon="file" title="No syllabus units" />}
            </div>
          </div>
        )}

        {tab === "lesson-plans" && !portal && (
          <div className={`grid grid-cols-1 gap-6 max-md:gap-4 ${canTeach ? "lg:grid-cols-2" : ""}`}>
            {canTeach && formCard("Create lesson plan", <>
              <Field label="Syllabus unit" required><Select aria-label="Syllabus unit" value={lessonForm.syllabus_id} onChange={(e) => setLessonForm({ ...lessonForm, syllabus_id: e.target.value })}><option value="">Select unit</option>{syllabus.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.subject?.name} · {className(s.class)}</option>)}</Select></Field>
              {teacherSelect(lessonForm.teacher_id, (v) => setLessonForm({ ...lessonForm, teacher_id: v }))}
              <Field label="Topic" required><Input value={lessonForm.topic} onChange={(e) => setLessonForm({ ...lessonForm, topic: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3 max-md:[&>*]:min-w-0">
                <Field label="Date" required><Input type="date" value={lessonForm.date} onChange={(e) => setLessonForm({ ...lessonForm, date: e.target.value })} /></Field>
                <Field label="Status"><Select aria-label="Status" value={lessonForm.status} onChange={(e) => setLessonForm({ ...lessonForm, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
              <Field label="Lesson plan PDF" hint={lessonFile ? `${lessonFile.name} · ${fmtSize(lessonFile.size)}` : "Optional · PDF only, up to 10 MB. You can also attach or replace it later."}>
                <Input key={lessonFileKey} type="file" accept="application/pdf,.pdf" aria-label="Lesson plan PDF"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    const err = f ? checkLessonPdf(f) : null;
                    if (err) { toast.push(err, "error"); e.target.value = ""; setLessonFile(null); return; }
                    setLessonFile(f);
                  }} />
              </Field>
              <Button variant="primary" onClick={addLessonPlan} loading={busy} className="w-full"><Icon name="clipboard" className="h-4 w-4" /> Create plan</Button>
            </>)}
            <div className="card max-h-[620px] overflow-y-auto max-md:hidden">
              {lessonPlans.map((p) => {
                const editable = canTeach && mine(p.teacherId);
                return (
                  <div key={p.id} className="flex items-start gap-3 border-b border-line p-4 hover:bg-surface-2 max-md:flex-wrap">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${p.status === "Completed" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                      <Icon name={p.status === "Completed" ? "check" : "clock"} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink max-md:[overflow-wrap:anywhere]">{p.topic}</p>
                      <p className="text-xs text-ink-2">{p.syllabus?.title} · {p.syllabus?.subject?.name} · {className(p.syllabus?.class)}</p>
                      <p className="mt-1 text-xs text-ink-3">{fmtDate(p.date)} · {p.teacher?.name ?? "—"}</p>
                      <div className="mt-2"><LessonPlanPdfActions plan={p} editable={editable} onChanged={loadAll} /></div>
                    </div>
                    {editable ? (
                      <div className="flex shrink-0 items-center gap-1.5 max-md:ml-[3.25rem] max-md:w-[calc(100%-3.25rem)]">
                        <select aria-label={`Status of ${p.topic}`} className="field w-auto !py-1.5 text-xs max-md:min-w-0 max-md:flex-1" value={p.status} onChange={async (e) => { const status = e.target.value; if (await confirmAction({ title: `Mark ${p.topic} as ${status}?`, text: `Status changes from ${p.status} to ${status}.`, confirmText: "Update status", tone: "primary" })) await send(`/api/academics/lesson-plans/${p.id}/status`, "PATCH", { status }, `${p.topic} marked ${status}`); }}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        <button aria-label={`Delete ${p.topic}`} onClick={async () => { if (await confirmDel(p.topic)) await send(`/api/academics/lesson-plans/${p.id}`, "DELETE", undefined, `Lesson plan ${p.topic} deleted`); }} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft max-md:p-3"><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                    ) : <Badge tone={p.status === "Completed" ? "emerald" : "amber"}>{p.status}</Badge>}
                  </div>
                );
              })}
              {lessonPlans.length === 0 && <EmptyState icon="clipboard" title="No lesson plans" />}
            </div>

            {/* Phones: lesson-plan cards (same handlers as the desktop list). */}
            <div className="space-y-3 md:hidden">
              {lessonPlans.map((p) => {
                const editable = canTeach && mine(p.teacherId);
                const look = p.status === "Completed"
                  ? { tile: "bg-ok-soft text-ok-ink", icon: "check", field: "border-ok-line bg-ok-soft text-ok-ink" }
                  : p.status === "In Progress"
                    ? { tile: "bg-info-soft text-info-ink", icon: "file", field: "border-info-line bg-info-soft text-info-ink" }
                    : { tile: "bg-warn-soft text-warn-ink", icon: "clock", field: "border-warn-line bg-warn-soft text-warn-ink" };
                return (
                  <article key={p.id} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                    <div className="flex items-start gap-3">
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${look.tile}`}>
                        <Icon name={look.icon} className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{p.topic}</p>
                        <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
                          {[p.syllabus?.title, p.syllabus?.subject?.name, className(p.syllabus?.class)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                      <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-4 w-4" /> {fmtDate(p.date)}</span>
                      <span aria-hidden className="h-3.5 w-px bg-line" />
                      <span className="inline-flex min-w-0 items-center gap-1.5"><Icon name="user" className="h-4 w-4 shrink-0" /> <span className="truncate">{p.teacher?.name ?? "—"}</span></span>
                    </div>
                    <div className="mt-3 [&_.btn]:!min-h-12 [&_.btn]:!justify-center [&_.btn-ghost]:!border [&_.btn-ghost]:!border-line [&>div]:grid [&>div]:grid-cols-2 [&>div]:gap-2">
                      <LessonPlanPdfActions plan={p} editable={editable} onChanged={loadAll} />
                    </div>
                    <div className="mt-3 border-t border-line pt-3">
                      {editable ? (
                        <div className="flex items-center gap-2">
                          <div className={`relative flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 ${look.field}`}>
                            <Icon name={look.icon} className="h-4 w-4 shrink-0" />
                            <select
                              aria-label={`Status of ${p.topic}`}
                              className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-[14px] font-semibold text-current outline-none"
                              value={p.status}
                              onChange={async (e) => {
                                const status = e.target.value;
                                if (await confirmAction({ title: `Mark ${p.topic} as ${status}?`, text: `Status changes from ${p.status} to ${status}.`, confirmText: "Update status", tone: "primary" })) await send(`/api/academics/lesson-plans/${p.id}/status`, "PATCH", { status }, `${p.topic} marked ${status}`);
                              }}
                            >
                              {STATUSES.map((s) => <option key={s} className="bg-white text-ink">{s}</option>)}
                            </select>
                            <Icon name="chevronDown" className="pointer-events-none absolute right-3 h-4 w-4" />
                          </div>
                          <button
                            aria-label={`Delete ${p.topic}`}
                            onClick={async () => { if (await confirmDel(p.topic)) await send(`/api/academics/lesson-plans/${p.id}`, "DELETE", undefined, `Lesson plan ${p.topic} deleted`); }}
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger active:bg-danger/15"
                          >
                            <Icon name="trash" className="h-5 w-5" />
                          </button>
                        </div>
                      ) : (
                        <span className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold ${look.field}`}>
                          <Icon name={look.icon} className="h-4 w-4" /> {p.status}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
              {lessonPlans.length === 0 && <EmptyState icon="clipboard" title="No lesson plans" />}
            </div>
          </div>
        )}

        {tab === "assignments" && (
          <div className={`grid grid-cols-1 gap-6 max-md:gap-4 ${canTeach ? "lg:grid-cols-2" : ""}`}>
            {canTeach && formCard("Publish assignment", <>
              <div className="grid grid-cols-2 gap-3 max-md:[&>*]:min-w-0">
                <Field label="Class" required><Select aria-label="Class" value={assignmentForm.class_id} onChange={(e) => setAssignmentForm({ ...assignmentForm, class_id: e.target.value })}><option value="">Select class</option>{classes.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
                <Field label="Subject" required><Select aria-label="Subject" value={assignmentForm.subject_id} onChange={(e) => setAssignmentForm({ ...assignmentForm, subject_id: e.target.value })}><option value="">Select subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              </div>
              {teacherSelect(assignmentForm.teacher_id, (v) => setAssignmentForm({ ...assignmentForm, teacher_id: v }))}
              <div className="grid grid-cols-2 gap-3 max-md:[&>*]:min-w-0 max-md:grid-cols-1">
                <Field label="Title" required><Input value={assignmentForm.title} onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })} /></Field>
                <Field label="Due date" required><Input type="date" value={assignmentForm.due_date} onChange={(e) => setAssignmentForm({ ...assignmentForm, due_date: e.target.value })} /></Field>
              </div>
              <Field label="Description"><Textarea value={assignmentForm.description} onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })} /></Field>
              <Button variant="primary" onClick={addAssignment} loading={busy} className="w-full"><Icon name="academics" className="h-4 w-4" /> Publish assignment</Button>
            </>)}
            <div className="card max-h-[620px] overflow-y-auto max-md:max-h-none max-md:overflow-visible">
              {assignments.map((a) => {
                const overdue = a.dueDate ? new Date(a.dueDate) < new Date() : false;
                return (
                  <div key={a.id} className="flex items-start gap-3 border-b border-line p-4 hover:bg-surface-2">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${overdue ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}><Icon name="academics" className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink max-md:[overflow-wrap:anywhere]">{a.title}</p>
                      <p className="text-xs text-ink-2">{a.subject?.name} · {className(a.class)} · {a.teacher?.name ?? "—"}</p>
                      {a.description && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{a.description}</p>}
                      {a.dueDate && <p className={`mt-1 text-xs ${overdue ? "text-danger" : "text-warn"}`}>Due {fmtDate(a.dueDate)}</p>}
                    </div>
                    {canTeach && mine(a.teacherId) && (
                      <button aria-label={`Delete ${a.title}`} onClick={async () => { if (await confirmDel(a.title)) await send(`/api/academics/assignments/${a.id}`, "DELETE", undefined, `${a.title} deleted`); }} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft max-md:p-3"><Icon name="trash" className="h-4 w-4" /></button>
                    )}
                  </div>
                );
              })}
              {assignments.length === 0 && <EmptyState icon="academics" title="No assignments" />}
            </div>
          </div>
        )}

        {tab === "progress" && (
          <div className="space-y-4">
            <div className="card flex flex-wrap items-end gap-3 p-4 max-md:[&>label]:w-full">
              {!portal && (
                <Field label="Class">
                  <Select aria-label="Filter progress by class" className="w-auto max-md:!w-full" value={progressClass} onChange={(e) => setProgressClass(e.target.value)}>
                    <option value="">All classes</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
                  </Select>
                </Field>
              )}
              {progress && (
                <div className="ml-auto text-right max-md:ml-0 max-md:w-full max-md:text-left">
                  <p className="text-xs uppercase tracking-wide text-ink-3">Overall coverage</p>
                  <p className="tnum text-2xl font-bold text-brand-700">{progress.overall.pct === null ? "—" : `${progress.overall.pct}%`}</p>
                  <p className="text-xs text-ink-3">{progress.overall.completed} of {progress.overall.planned} lesson plans completed</p>
                </div>
              )}
            </div>
            <div className="card overflow-hidden">
              <TableView id="progress" title="Subject" mobileHide={["Units"]}>
                <table className="w-full text-sm">
                  <thead className="table-head"><tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Units</th><th className="px-4 py-3">Completed / planned</th><th className="px-4 py-3">Coverage</th></tr></thead>
                  <tbody>
                    {(progress?.by_subject ?? []).map((s) => (
                      <tr key={`${s.class_id}|${s.subject_id}`} className="row-hover border-t border-line">
                        <td className="px-4 py-3">{s.class_name}</td>
                        <td className="px-4 py-3 font-semibold">{s.subject_name}</td>
                        <td className="tnum px-4 py-3">{s.units}</td>
                        <td className="tnum px-4 py-3">{s.completed} / {s.planned}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={s.pct ?? 0} tone={(s.pct ?? 0) >= 75 ? "emerald" : (s.pct ?? 0) >= 40 ? "amber" : "rose"} className="w-24" label={`${s.subject_name} coverage`} />
                            <span className="tnum text-xs text-ink-2">{s.pct === null ? "No plans" : `${s.pct}%`}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {progress && progress.by_subject.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">No syllabus units for this selection</td></tr>}
                  </tbody>
                </table>
              </TableView>
            </div>
          </div>
        )}
      </div>
      {canTeach && !portal && <NoticeComposer open={notifyOpen} onClose={() => setNotifyOpen(false)} />}
    </div>
  );
}
