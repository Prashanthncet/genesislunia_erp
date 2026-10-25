"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, ROLE, useMe } from "@/lib/auth";
import {
  AnimatedNumber, Badge, Button, EmptyState, Field, Icon, Input, PageHeader, ProgressBar, Reveal, Select, Tabs, useToast,
} from "@/components/ui";
import { TableView } from "@/components/TableView";
import { confirmAction } from "@/components/confirm";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { gradeTone, type GradeBand } from "@/components/academics/grades";

type ClassItem = { id: string; name: string; section: string | null };
type Subject = { id: string; name: string; code: string };
type Exam = { id: string; name: string; date: string; classId: string | null; term: string | null; academicYear: string | null; weight: number; maxMarks: number; class?: ClassItem | null; _count?: { examMarks: number } };
type Teaching = { all: boolean; pairs: { class_id: string; class_name: string; subject_id: string; subject_name: string }[] };
type GridRow = { student_id: string; full_name: string; admission_no: string; roll_no: string | null; score: number | null };
type Grid = { exam: { id: string; name: string; max_marks: number; weight: number; class_id: string }; subject: Subject; rows: GridRow[] };
type RosterStudent = { id: string; fullName: string; admissionNo: string; rollNo: string | null };
type ReportCard = {
  student: { id: string; full_name: string; admission_no: string; roll_no: string | null; class_name: string | null };
  term: string | null; academic_year: string | null;
  subjects: { subject_id: string; subject_name: string; subject_code: string; weighted_pct: number; grade: string | null; grade_point: number | null; exams: { exam_id: string; exam_name: string; score: number; max_score: number; weight: number; pct: number }[] }[];
  overall_pct: number | null; overall_grade: string | null; grade_point: number | null; remark: string | null;
  rank: number | null; class_size: number; pass_mark: number; passed: boolean | null;
  attendance: { present: number; total: number; pct: number | null; from: string | null; to: string | null };
  /** live = computed now from marks; published = the frozen term snapshot parents see. */
  publication?: { status: "live" | "published"; published_at: string | null; changed_since_publish: boolean | null };
};
type Publication = {
  published: boolean; published_count: number; published_at: string | null; changed_count: number;
  students: { student_id: string; full_name: string; published_at: string | null; changed_since_publish: boolean | null }[];
};
type PublishedCard = { term: string; academic_year: string; published_at: string };
type ClassGeneration = {
  total: number; ready: number; class_pdf_url: string;
  students: { student_id: string; full_name: string; admission_no: string; status: string; overall_pct: number | null; overall_grade: string | null; rank: number | null; attendance_pct: number | null; pdf_url: string }[];
};

type Tab = "marks" | "report" | "exams" | "bands";
const cls = (c?: { name: string; section: string | null } | null) => (c ? `${c.name}${c.section ? ` ${c.section}` : ""}` : "Any class");
const errText = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

export default function ExamsPage() {
  const { me } = useMe();
  const toast = useToast();
  const portal = isPortal(me);
  const canTeach = hasRole(me, [...R.TEACHING, ...R.ACADEMIC_SETUP]);
  const canSetup = hasRole(me, R.ACADEMIC_SETUP);
  const canRead = !!me && (hasRole(me, R.STAFF) || portal);

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [];
    if (canTeach) t.push({ id: "marks", label: "Marks entry" });
    t.push({ id: "report", label: "Report cards" });
    if (!portal) t.push({ id: "exams", label: "Exams" });
    t.push({ id: "bands", label: "Grade scale" });
    return t;
  }, [canTeach, portal]);
  const [tab, setTab] = useState<Tab>("report");
  useEffect(() => { if (canTeach) setTab("marks"); }, [canTeach]);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [bands, setBands] = useState<GradeBand[]>([]);
  const [teaching, setTeaching] = useState<Teaching>({ all: false, pairs: [] });

  const loadBase = useCallback(async () => {
    if (!me) return;
    try {
      const staff = hasRole(me, R.STAFF);
      const [c, s, e, b, t] = await Promise.all([
        staff ? apiFetch<ClassItem[]>("/api/classes").catch(() => [] as ClassItem[]) : Promise.resolve([] as ClassItem[]),
        apiFetch<Subject[]>("/api/academics/subjects"),
        apiFetch<Exam[]>("/api/exams"),
        apiFetch<GradeBand[]>("/api/exams/grade-bands"),
        hasRole(me, [...R.TEACHING, ...R.ACADEMIC_SETUP]) ? apiFetch<Teaching>("/api/exams/my-teaching") : Promise.resolve({ all: false, pairs: [] }),
      ]);
      setClasses(c); setSubjects(s); setExams(e); setBands(b); setTeaching(t);
    } catch (err) { toast.push(errText(err), "error"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);
  useEffect(() => { loadBase(); }, [loadBase]);

  if (me && !canRead) return <EmptyState icon="lock" title="You don't have access to this page" />;

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader icon="exams" title="Exams & Report Cards" subtitle="Marks entry, weighted grading on your school's scale, and printable report cards." />
      </Reveal>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div key={tab} style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        {tab === "marks" && canTeach && <MarksEntry classes={classes} subjects={subjects} exams={exams} teaching={teaching} isTeacher={me?.role === ROLE.TEACHER} onSaved={loadBase} />}
        {tab === "report" && <ReportCards classes={classes} teaching={teaching} bands={bands} canGenerate={canTeach} canPublish={canSetup} portal={portal} />}
        {tab === "exams" && !portal && <ExamsAdmin classes={classes} exams={exams} canSetup={canSetup} onChange={loadBase} />}
        {tab === "bands" && <BandEditor bands={bands} canEdit={canSetup} onSaved={setBands} />}
      </div>
    </div>
  );
}

/* ── Marks entry grid ─────────────────────────────────────────── */

function MarksEntry({ classes, subjects, exams, teaching, isTeacher, onSaved }: {
  classes: ClassItem[]; subjects: Subject[]; exams: Exam[]; teaching: Teaching; isTeacher: boolean; onSaved: () => void;
}) {
  const toast = useToast();
  const [classId, setClassId] = useState("");
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const classOptions = teaching.all
    ? classes.map((c) => ({ id: c.id, label: cls(c) }))
    : [...new Map(teaching.pairs.map((p) => [p.class_id, { id: p.class_id, label: p.class_name }])).values()];
  const subjectOptions = teaching.all
    ? subjects.map((s) => ({ id: s.id, label: s.name }))
    : teaching.pairs.filter((p) => p.class_id === classId).map((p) => ({ id: p.subject_id, label: p.subject_name }));
  const examOptions = exams.filter((e) => !classId || e.classId === classId || e.classId === null);

  useEffect(() => { setExamId(""); setSubjectId(""); setGrid(null); }, [classId]);

  const load = useCallback(async () => {
    if (!examId || !subjectId || !classId) { setGrid(null); return; }
    setLoading(true);
    try {
      const g = await apiFetch<Grid>(`/api/exams/marks?exam_id=${encodeURIComponent(examId)}&subject_id=${encodeURIComponent(subjectId)}&class_id=${encodeURIComponent(classId)}`);
      setGrid(g);
      setDraft(Object.fromEntries(g.rows.map((r) => [r.student_id, r.score === null ? "" : String(r.score)])));
    } catch (e) { setGrid(null); toast.push(errText(e), "error"); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, subjectId, classId]);
  useEffect(() => { load(); }, [load]);

  const max = grid?.exam.max_marks ?? 100;
  const rowError = (v: string): string | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return "Not a number";
    if (n < 0 || n > max) return `Must be 0–${max}`;
    return null;
  };
  const errors = grid ? grid.rows.map((r) => rowError(draft[r.student_id] ?? "")).filter(Boolean).length : 0;
  const changed = grid ? grid.rows.filter((r) => (draft[r.student_id] ?? "") !== "" && Number(draft[r.student_id]) !== r.score) : [];

  const save = async () => {
    if (!grid) return;
    if (errors) return toast.push(`Fix ${errors} invalid score(s) before saving`, "error");
    if (!changed.length) return toast.push("No changes to save", "info");
    if (!(await confirmAction({ title: `Save ${changed.length} mark(s) for ${grid.subject.name}?`, text: `${grid.exam.name} · these scores will be recorded for the class.`, confirmText: "Save marks", tone: "primary" }))) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ recorded: number }>("/api/exams/marks", {
        method: "POST",
        body: JSON.stringify({ exam_id: grid.exam.id, subject_id: grid.subject.id, class_id: classId, marks: changed.map((r) => ({ student_id: r.student_id, score: Number(draft[r.student_id]) })) }),
      });
      toast.push(`Saved ${res.recorded} mark(s)`, "success");
      await load();
      onSaved();
    } catch (e) { toast.push(`Save failed: ${errText(e)}`, "error"); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <Field label="Class" required>
          <Select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select class</option>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Exam" required>
          <Select aria-label="Exam" value={examId} disabled={!classId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select exam</option>
            {examOptions.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.date} · max {e.maxMarks}</option>)}
          </Select>
        </Field>
        <Field label="Subject" required hint={isTeacher ? "Only subjects you teach this class (timetable)" : undefined}>
          <Select aria-label="Subject" value={subjectId} disabled={!classId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Select subject</option>
            {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
      </div>
      {isTeacher && classOptions.length === 0 && (
        <EmptyState icon="timetable" title="No teaching assignments found" hint="Marks entry follows your timetable. Ask the timetable admin to assign you periods." />
      )}
      {loading && <div className="card p-6 text-sm text-ink-3">Loading students…</div>}
      {grid && (
        <div className="card overflow-hidden max-md:overflow-visible">
          <div className="card-head">
            <div>
              <h2 className="font-display text-[18px] font-semibold text-ink max-md:!text-[16px]">{grid.exam.name} · {grid.subject.name}</h2>
              <p className="text-[12.5px] text-ink-3">Max marks {max} · weight {grid.exam.weight} · {grid.rows.length} students · {changed.length} unsaved</p>
            </div>
            <Button variant="primary" onClick={save} loading={saving} disabled={!changed.length || errors > 0} className="max-md:w-full"><Icon name="check" className="h-4 w-4" /> Save marks</Button>
          </div>
          <TableView id="marks" title="Student">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Roll</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Score (0–{max})</th><th className="px-4 py-3">%</th></tr></thead>
              <tbody>
                {grid.rows.map((r) => {
                  const v = draft[r.student_id] ?? "";
                  const err = rowError(v);
                  const pctV = v !== "" && !err ? Math.round((Number(v) / max) * 1000) / 10 : null;
                  return (
                    <tr key={r.student_id} className="row-hover border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.roll_no ?? "—"}</td>
                      <td className="px-4 py-2.5"><span className="font-semibold">{r.full_name}</span><span className="block text-xs text-ink-3">{r.admission_no}</span></td>
                      <td className="px-4 py-2.5">
                        <input
                          aria-label={`Score for ${r.full_name}`} inputMode="decimal" value={v}
                          onChange={(e) => setDraft({ ...draft, [r.student_id]: e.target.value })}
                          className={`field w-28 tnum ${err ? "!border-danger" : ""}`}
                          aria-invalid={!!err}
                        />
                        {err && <span className="mt-1 block text-[11.5px] font-medium text-danger">{err}</span>}
                      </td>
                      <td className="tnum px-4 py-2.5 text-ink-2">{pctV === null ? "—" : `${pctV}%`}</td>
                    </tr>
                  );
                })}
                {grid.rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-3">No active students in this class</td></tr>}
              </tbody>
            </table>
          </TableView>
          {grid.rows.length > 0 && (
            <div className="sticky bottom-[calc(var(--m-nav-h)+var(--m-safe-bottom)+0.5rem)] z-10 flex items-center gap-3 rounded-b-[inherit] border-t border-line bg-surface/95 p-3 backdrop-blur md:hidden">
              <span className="min-w-0 flex-1 text-[12.5px] text-ink-3">{errors > 0 ? <span className="font-medium text-danger">{errors} invalid</span> : `${changed.length} unsaved`}</span>
              <Button variant="primary" onClick={save} loading={saving} disabled={!changed.length || errors > 0} className="flex-1"><Icon name="check" className="h-4 w-4" /> Save marks</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Report cards (preview, PDF, class generation) ───────────── */

function ReportCards({ classes, teaching, bands, canGenerate, canPublish, portal }: {
  classes: ClassItem[]; teaching: Teaching; bands: GradeBand[]; canGenerate: boolean; canPublish: boolean; portal: boolean;
}) {
  const { me } = useMe();
  const toast = useToast();
  const [classId, setClassId] = useState("");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("");
  const [year, setYear] = useState("");
  const [card, setCard] = useState<ReportCard | null>(null);
  const [gen, setGen] = useState<ClassGeneration | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "published">("live");
  const [pub, setPub] = useState<Publication | null>(null);
  const [needConfirm, setNeedConfirm] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedCard[]>([]);

  // Portal users pick from their own children / themselves — never a free-text id.
  const portalKids = useMemo(() => {
    if (!me) return [] as { id: string; label: string }[];
    if (me.role === ROLE.STUDENT && me.student) return [{ id: me.student.id, label: me.student.fullName }];
    return me.children.map((c) => ({ id: c.id, label: `${c.fullName}${c.class ? ` · ${cls(c.class)}` : ""}` }));
  }, [me]);
  useEffect(() => { if (portal && portalKids.length && !studentId) setStudentId(portalKids[0].id); }, [portal, portalKids, studentId]);

  const classOptions = teaching.all || !canGenerate
    ? classes.map((c) => ({ id: c.id, label: cls(c) }))
    : [...new Map(teaching.pairs.map((p) => [p.class_id, { id: p.class_id, label: p.class_name }])).values()];

  useEffect(() => {
    setStudentId(portal ? studentId : ""); setCard(null); setGen(null); setRoster([]);
    if (!classId || portal) return;
    apiFetch<RosterStudent[]>(`/api/exams/class-roster/${encodeURIComponent(classId)}`).then(setRoster).catch((e) => toast.push(errText(e), "error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const qs = (withSource = true) => {
    const q = new URLSearchParams();
    if (term.trim()) q.set("term", term.trim());
    if (year.trim()) q.set("academic_year", year.trim());
    if (withSource && !portal && source === "published") q.set("source", "published");
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  // Portal: parents/students can only open terms the school has published.
  useEffect(() => {
    if (!portal || !studentId) return;
    apiFetch<PublishedCard[]>(`/api/portal/children/${encodeURIComponent(studentId)}/report-cards`)
      .then((rows) => {
        setPublished(rows);
        if (rows[0]) { setTerm(rows[0].term); setYear(rows[0].academic_year); }
      })
      .catch(() => setPublished([]));
  }, [portal, studentId]);

  const termReady = !!(classId && term.trim() && year.trim());
  const loadPublication = async () => {
    if (!termReady) return setPub(null);
    try {
      setPub(await apiFetch<Publication>(`/api/exams/report-cards/published?class_id=${encodeURIComponent(classId)}&term=${encodeURIComponent(term.trim())}&academic_year=${encodeURIComponent(year.trim())}`));
    } catch { setPub(null); }
  };
  useEffect(() => {
    setNeedConfirm(null);
    if (portal || !canGenerate) return;
    const t = setTimeout(loadPublication, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term, year, portal, canGenerate]);

  const publish = async (confirm: boolean) => {
    if (!termReady) return toast.push("Choose a class, term and academic year to publish", "error");
    // The replace step (confirm=true) is already gated by the inline "Replace published cards" banner.
    if (!confirm && !(await confirmAction({ title: `${pub?.published ? "Re-publish" : "Publish"} report cards for ${term.trim()} ${year.trim()}?`, text: "Every student's card for this class is frozen and becomes visible to parents and students.", confirmText: pub?.published ? "Re-publish" : "Publish", tone: "primary" }))) return;
    setBusy("publish");
    try {
      const r = await apiFetch<{ published: number; republished: boolean; without_marks: number }>("/api/exams/report-cards/publish", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, term: term.trim(), academic_year: year.trim(), ...(confirm ? { confirm: true } : {}) }),
      });
      toast.push(`${r.published} report card(s) ${r.republished ? "re-published" : "published"}${r.without_marks ? ` (${r.without_marks} without marks)` : ""}`, "success");
      setNeedConfirm(null);
      await loadPublication();
    } catch (e) {
      const msg = errText(e);
      if (/confirm/i.test(msg)) setNeedConfirm(msg);
      else toast.push(msg, "error");
    } finally { setBusy(null); }
  };

  const preview = async () => {
    if (!studentId) return toast.push("Choose a student", "error");
    setBusy("preview");
    try { setCard(await apiFetch<ReportCard>(`/api/exams/report-card/${encodeURIComponent(studentId)}${qs()}`)); }
    catch (e) { setCard(null); toast.push(errText(e), "error"); } finally { setBusy(null); }
  };
  const download = async (path: string, name: string, key: string) => {
    setBusy(key);
    try { await apiDownload(path, name); toast.push("PDF downloaded", "success"); }
    catch (e) { toast.push(`Download failed: ${errText(e)}`, "error"); } finally { setBusy(null); }
  };
  const generate = async () => {
    if (!classId) return toast.push("Choose a class", "error");
    setBusy("generate");
    try {
      const g = await apiFetch<ClassGeneration>(`/api/exams/report-cards/class/${encodeURIComponent(classId)}${qs(false)}`, { method: "POST" });
      setGen(g);
      toast.push(`${g.ready} of ${g.total} report cards ready`, "success");
    } catch (e) { toast.push(errText(e), "error"); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
        {portal ? (
          <Field label="Student">
            <Select aria-label="Student" value={studentId} onChange={(e) => { setStudentId(e.target.value); setCard(null); }}>
              {portalKids.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Class">
              <Select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class</option>
                {classOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Student">
              <Select aria-label="Student" value={studentId} disabled={!classId} onChange={(e) => { setStudentId(e.target.value); setCard(null); }}>
                <option value="">Select student</option>
                {roster.map((s) => <option key={s.id} value={s.id}>{s.rollNo ? `${s.rollNo} · ` : ""}{s.fullName}</option>)}
              </Select>
            </Field>
          </>
        )}
        {portal ? (
          <Field label="Term" hint="Only published report cards are shown">
            <Select aria-label="Published term" value={`${term}|${year}`} disabled={!published.length}
              onChange={(e) => { const [t, y] = e.target.value.split("|"); setTerm(t); setYear(y); setCard(null); }}>
              {!published.length && <option value="|">None published yet</option>}
              {published.map((p) => <option key={`${p.term}|${p.academic_year}`} value={`${p.term}|${p.academic_year}`}>{p.term} · {p.academic_year}</option>)}
            </Select>
          </Field>
        ) : (
          <MobileFilters label="Term & year" active={[term, year].filter((v) => v.trim()).length}>
            <Field label="Term" hint="Required to publish"><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Term 1" /></Field>
            <Field label="Academic year" hint="e.g. 2026-27"><Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-27" /></Field>
          </MobileFilters>
        )}
        <div className="flex flex-wrap items-end gap-2">
          {!portal && (
            <Select aria-label="Card source" className="field w-auto" value={source} onChange={(e) => { setSource(e.target.value as "live" | "published"); setCard(null); }}>
              <option value="live">Live marks</option>
              <option value="published">Published</option>
            </Select>
          )}
          <Button variant="primary" onClick={preview} loading={busy === "preview"} disabled={!studentId || (portal && !published.length)}><Icon name="eye" className="h-4 w-4" /> Preview</Button>
          {studentId && (!portal || published.length > 0) && <Button onClick={() => download(`/api/exams/report-card/${encodeURIComponent(studentId)}/pdf${qs()}`, "report-card.pdf", "pdf")} loading={busy === "pdf"}><Icon name="download" className="h-4 w-4" /> PDF</Button>}
        </div>
      </div>

      {canGenerate && !portal && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Publish term report cards</p>
              <p className="text-[12.5px] text-ink-3">Freezes every student&apos;s card for the chosen class, term and year. Parents and students only ever see published cards; later mark edits don&apos;t change them.</p>
            </div>
            {canPublish && (
              <Button variant="primary" onClick={() => publish(false)} loading={busy === "publish"} disabled={!termReady} className="max-md:w-full">
                <Icon name="check" className="h-4 w-4" /> {pub?.published ? "Re-publish" : "Publish"}
              </Button>
            )}
          </div>
          {!termReady ? (
            <p className="text-[12.5px] text-ink-3">Choose a class, term and academic year to see its publication status.</p>
          ) : pub && (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              {pub.published
                ? <Badge tone="emerald">Published {pub.published_at ? pub.published_at.slice(0, 10) : ""} · {pub.published_count} card(s)</Badge>
                : <Badge tone="amber">Not published yet</Badge>}
              {pub.changed_count > 0 && (
                <Badge tone="rose">{pub.changed_count} changed since publish: {pub.students.filter((x) => x.changed_since_publish).map((x) => x.full_name).slice(0, 4).join(", ")}{pub.changed_count > 4 ? "…" : ""}</Badge>
              )}
            </div>
          )}
          {needConfirm && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-line bg-warn-soft px-3 py-2.5 text-[12.5px] text-ink">
              <span>{needConfirm} Replacing changes what parents see, and is recorded in the audit log.</span>
              <span className="flex gap-2 max-md:w-full max-md:flex-wrap">
                <Button size="sm" onClick={() => setNeedConfirm(null)}>Cancel</Button>
                <Button size="sm" variant="danger" loading={busy === "publish"} onClick={() => publish(true)} className="max-md:flex-1">Replace published cards</Button>
              </span>
            </div>
          )}
        </div>
      )}

      {canGenerate && !portal && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-ink">Generate report cards for the class</p>
            <p className="text-[12.5px] text-ink-3">Provisional: computes every student&apos;s card from live marks (staff only); download individually or as one combined PDF.</p>
          </div>
          <div className="flex gap-2 max-md:w-full">
            <Button variant="accent" className="max-md:flex-1" onClick={generate} loading={busy === "generate"} disabled={!classId}><Icon name="sparkles" className="h-4 w-4" /> Generate</Button>
            {gen && <Button className="max-md:flex-1" onClick={() => download(gen.class_pdf_url, "report-cards.pdf", "class")} loading={busy === "class"}><Icon name="download" className="h-4 w-4" /> Class PDF</Button>}
          </div>
        </div>
      )}

      {gen && (
        <div className="card overflow-hidden">
          <TableView id="generation" title="Student" mobileHide={["Attendance"]}>
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Overall</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3 text-right">PDF</th></tr></thead>
              <tbody>
                {gen.students.map((s) => (
                  <tr key={s.student_id} className="row-hover border-t border-line">
                    <td className="tnum px-4 py-2.5">{s.rank ?? "—"}</td>
                    <td className="px-4 py-2.5"><span className="font-semibold">{s.full_name}</span><span className="block text-xs text-ink-3">{s.admission_no}</span></td>
                    <td className="px-4 py-2.5"><Badge tone={s.status === "ready" ? "emerald" : "amber"}>{s.status === "ready" ? "Ready" : "No marks"}</Badge></td>
                    <td className="tnum px-4 py-2.5">{s.overall_pct === null ? "—" : `${s.overall_pct}%`}</td>
                    <td className="px-4 py-2.5">{s.overall_grade ? <Badge tone={gradeTone(s.overall_grade, bands)}>{s.overall_grade}</Badge> : "—"}</td>
                    <td className="tnum px-4 py-2.5">{s.attendance_pct === null ? "—" : `${s.attendance_pct}%`}</td>
                    <td className="px-4 py-2.5 text-right"><Button size="sm" onClick={() => download(s.pdf_url, `report-card-${s.admission_no}.pdf`, s.student_id)} loading={busy === s.student_id}><Icon name="download" className="h-3.5 w-3.5" /> PDF</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        </div>
      )}

      {card && <CardPreview card={card} bands={bands} />}
    </div>
  );
}

function CardPreview({ card, bands }: { card: ReportCard; bands: GradeBand[] }) {
  const overall = card.overall_pct ?? 0;
  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-5 max-md:p-4">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">{card.student.full_name}</h3>
            <p className="text-sm text-ink-2 max-md:[overflow-wrap:anywhere]">{card.student.admission_no} · {card.student.class_name ?? "—"} · {[card.term, card.academic_year].filter(Boolean).join(" · ") || "All exams"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge tone="brand">Rank {card.rank ? `${card.rank} of ${card.class_size}` : "—"}</Badge>
              <Badge tone="sky">CGPA {card.grade_point ?? "—"}</Badge>
              <Badge tone="teal">Attendance {card.attendance.pct === null ? "no records" : `${card.attendance.pct}%`}</Badge>
              {card.publication?.status === "published" && <Badge tone="emerald">Published {card.publication.published_at?.slice(0, 10)}</Badge>}
              {card.publication?.status === "live" && (
                <Badge tone={card.publication.changed_since_publish ? "rose" : "slate"}>
                  {card.publication.published_at
                    ? card.publication.changed_since_publish ? "Live · changed since publish" : "Live · matches published card"
                    : "Live · not published"}
                </Badge>
              )}
              {card.passed !== null && <Badge tone={card.passed ? "emerald" : "rose"}>{card.passed ? "Pass" : `Below pass mark (${card.pass_mark}%)`}</Badge>}
            </div>
            <div className="mt-3 max-w-xs"><ProgressBar value={overall} tone={card.passed === false ? "rose" : "emerald"} label="Overall percentage" /></div>
          </div>
          <div className="text-right max-md:w-full max-md:text-left">
            <p className="text-4xl font-black text-brand-700">{card.overall_pct === null ? "—" : <AnimatedNumber value={card.overall_pct} suffix="%" decimals={1} />}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Overall · Grade {card.overall_grade ?? "—"}{card.remark ? ` · ${card.remark}` : ""}</p>
          </div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <TableView id="report" title="Subject">
          <table className="w-full text-sm">
            <thead className="table-head"><tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Exams (score / max × weight)</th><th className="px-4 py-3">Weighted %</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">GP</th></tr></thead>
            <tbody>
              {card.subjects.map((s) => (
                <tr key={s.subject_id} className="row-hover border-t border-line">
                  <td className="px-4 py-3"><span className="font-semibold">{s.subject_name}</span><span className="block font-mono text-xs text-ink-3">{s.subject_code}</span></td>
                  <td className="px-4 py-3 text-xs text-ink-2">{s.exams.map((e) => <span key={e.exam_id} className="block">{e.exam_name}: <span className="tnum">{e.score}/{e.max_score}</span> × {e.weight}</span>)}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-2"><strong className="tnum">{s.weighted_pct}%</strong><span className="hidden w-16 sm:block"><ProgressBar value={s.weighted_pct} tone="brand" /></span></span></td>
                  <td className="px-4 py-3">{s.grade ? <Badge tone={gradeTone(s.grade, bands)}>{s.grade}</Badge> : "—"}</td>
                  <td className="tnum px-4 py-3">{s.grade_point ?? "—"}</td>
                </tr>
              ))}
              {card.subjects.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-3">No marks recorded for this period.</td></tr>}
            </tbody>
          </table>
        </TableView>
      </div>
    </div>
  );
}

/* ── Exams list + create ──────────────────────────────────────── */

function ExamsAdmin({ classes, exams, canSetup, onChange }: { classes: ClassItem[]; exams: Exam[]; canSetup: boolean; onChange: () => void }) {
  const toast = useToast();
  const blank = { name: "", date: "", class_id: "", term: "", academic_year: "", weight: "1", max_marks: "100" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!form.name || !form.date) return toast.push("Name and date are required", "error");
    const weight = Number(form.weight), maxMarks = Number(form.max_marks);
    if (!(weight > 0)) return toast.push("Weight must be greater than 0", "error");
    if (!(maxMarks >= 1)) return toast.push("Max marks must be at least 1", "error");
    setBusy(true);
    try {
      await apiFetch("/api/exams", { method: "POST", body: JSON.stringify({
        name: form.name, date: form.date, weight, max_marks: maxMarks,
        ...(form.class_id ? { class_id: form.class_id } : {}), ...(form.term ? { term: form.term } : {}), ...(form.academic_year ? { academic_year: form.academic_year } : {}),
      }) });
      setForm(blank); onChange(); toast.push("Exam created", "success");
    } catch (e) { toast.push(errText(e), "error"); } finally { setBusy(false); }
  };
  const remove = async (e: Exam) => {
    if (!(await confirmAction({ title: `Delete ${e.name}?`, text: "This cannot be undone.", confirmText: "Delete", tone: "danger" }))) return;
    try { await apiFetch(`/api/exams/${e.id}`, { method: "DELETE" }); onChange(); toast.push(`${e.name} deleted`, "success"); }
    catch (err) { toast.push(errText(err), "error"); }
  };
  return (
    <div className={`grid grid-cols-1 gap-6 ${canSetup ? "lg:grid-cols-[22rem_1fr]" : ""}`}>
      {canSetup && (
        <div className="card space-y-3 p-5 max-md:p-4">
          <h3 className="font-semibold text-ink">Create exam</h3>
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3 max-md:[&>*]:min-w-0">
            <Field label="Date" required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Class"><Select aria-label="Exam class" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}><option value="">Any class</option>{classes.map((c) => <option key={c.id} value={c.id}>{cls(c)}</option>)}</Select></Field>
            <Field label="Term"><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="Term 1" /></Field>
            <Field label="Academic year"><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="2026-27" /></Field>
            <Field label="Weight" hint="In the weighted average"><Input inputMode="decimal" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
            <Field label="Max marks"><Input inputMode="decimal" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} /></Field>
          </div>
          <Button variant="primary" className="w-full" onClick={create} loading={busy}><Icon name="plus" className="h-4 w-4" /> Create exam</Button>
        </div>
      )}
      <div className="card overflow-hidden">
        <TableView id="exams" title="Exam" mobileHide={["Weight", "Max"]}>
          <table className="w-full text-sm">
            <thead className="table-head"><tr><th className="px-4 py-3">Exam</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Term / year</th><th className="px-4 py-3">Weight</th><th className="px-4 py-3">Max</th><th className="px-4 py-3">Marks</th>{canSetup && <th className="px-4 py-3" />}</tr></thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id} className="row-hover border-t border-line">
                  <td className="px-4 py-3 font-semibold">{e.name}</td>
                  <td className="px-4 py-3 text-xs">{e.date}</td>
                  <td className="px-4 py-3">{cls(e.class)}</td>
                  <td className="px-4 py-3 text-xs">{[e.term, e.academicYear].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="tnum px-4 py-3">{e.weight}</td>
                  <td className="tnum px-4 py-3">{e.maxMarks}</td>
                  <td className="tnum px-4 py-3">{e._count?.examMarks ?? 0}</td>
                  {canSetup && <td className="px-4 py-3 text-right"><button aria-label={`Delete ${e.name}`} onClick={() => remove(e)} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft max-md:p-3"><Icon name="trash" className="h-4 w-4" /></button></td>}
                </tr>
              ))}
              {exams.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-3">No exams yet</td></tr>}
            </tbody>
          </table>
        </TableView>
      </div>
    </div>
  );
}

/* ── Grade band editor ───────────────────────────────────────── */

function BandEditor({ bands, canEdit, onSaved }: { bands: GradeBand[]; canEdit: boolean; onSaved: (b: GradeBand[]) => void }) {
  const toast = useToast();
  type Row = { grade: string; min: string; gp: string; remark: string };
  const toRows = (b: GradeBand[]): Row[] => [...b].sort((x, y) => y.minPercent - x.minPercent).map((x) => ({ grade: x.grade, min: String(x.minPercent), gp: x.gradePoint === null ? "" : String(x.gradePoint), remark: x.remark ?? "" }));
  const [rows, setRows] = useState<Row[]>(toRows(bands));
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(toRows(bands)), [bands]);

  const problem = (): string | null => {
    if (!rows.length) return "Add at least one band";
    const mins = rows.map((r) => Number(r.min));
    if (rows.some((r) => !r.grade.trim())) return "Every band needs a grade";
    if (mins.some((m) => !Number.isFinite(m) || m < 0 || m > 100)) return "Thresholds must be between 0 and 100";
    if (new Set(mins).size !== mins.length) return "Two bands share a threshold";
    if (new Set(rows.map((r) => r.grade.trim().toLowerCase())).size !== rows.length) return "Grades must be unique";
    if (!mins.includes(0)) return "One band must start at 0%";
    return null;
  };
  const err = canEdit ? problem() : null;

  const save = async () => {
    if (err) return toast.push(err, "error");
    if (!(await confirmAction({ title: "Save the grade scale?", text: "Report cards and the performance report will use the new bands.", confirmText: "Save scale", tone: "primary" }))) return;
    setBusy(true);
    try {
      const saved = await apiFetch<GradeBand[]>("/api/exams/grade-bands", { method: "PUT", body: JSON.stringify({ bands: rows.map((r) => ({
        grade: r.grade.trim(), min_percent: Number(r.min), ...(r.gp !== "" ? { grade_point: Number(r.gp) } : {}), ...(r.remark.trim() ? { remark: r.remark.trim() } : {}),
      })) }) });
      onSaved(saved); toast.push("Grade scale saved", "success");
    } catch (e) { toast.push(errText(e), "error"); } finally { setBusy(false); }
  };
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <div>
          <h2 className="font-display text-[18px] font-semibold text-ink max-md:!text-[16px]">Grade scale</h2>
          <p className="text-[12.5px] text-ink-3">A percentage gets the band with the highest threshold it reaches. Used by report cards and the performance report.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2 max-md:w-full">
            <Button size="sm" className="max-md:flex-1" onClick={() => setRows([...rows, { grade: "", min: "", gp: "", remark: "" }])}><Icon name="plus" className="h-3.5 w-3.5" /> Band</Button>
            <Button size="sm" variant="primary" onClick={save} loading={busy} disabled={!!err} className="max-md:flex-1">Save scale</Button>
          </div>
        )}
      </div>
      {err && <p className="px-5 pt-3 text-[12.5px] font-medium text-danger">{err}</p>}
      <div className="max-md:overflow-x-auto max-md:overscroll-x-contain">
      <table className="w-full text-sm">
        <thead className="table-head"><tr><th className="px-4 py-3">Grade</th><th className="px-4 py-3">From %</th><th className="px-4 py-3">Grade point</th><th className="px-4 py-3">Remark</th>{canEdit && <th className="px-4 py-3" />}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {canEdit ? (
                <>
                  <td className="px-4 py-2"><input aria-label="Grade" className="field w-20 max-md:min-w-[4.5rem]" value={r.grade} onChange={(e) => set(i, "grade", e.target.value)} /></td>
                  <td className="px-4 py-2"><input aria-label="Minimum percent" inputMode="decimal" className="field w-24 tnum max-md:!w-20 max-md:min-w-[4.5rem]" value={r.min} onChange={(e) => set(i, "min", e.target.value)} /></td>
                  <td className="px-4 py-2"><input aria-label="Grade point" inputMode="decimal" className="field w-24 tnum max-md:!w-20 max-md:min-w-[4.5rem]" value={r.gp} onChange={(e) => set(i, "gp", e.target.value)} /></td>
                  <td className="px-4 py-2"><input aria-label="Remark" className="field max-md:min-w-[10rem]" value={r.remark} onChange={(e) => set(i, "remark", e.target.value)} /></td>
                  <td className="px-4 py-2 text-right"><button aria-label={`Remove band ${r.grade}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft max-md:p-3"><Icon name="trash" className="h-4 w-4" /></button></td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 font-bold">{r.grade}</td>
                  <td className="tnum px-4 py-3">≥ {r.min}%</td>
                  <td className="tnum px-4 py-3">{r.gp || "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{r.remark || "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
