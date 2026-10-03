"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, Tabs, useToast } from "@/components/ui";

type Subject = { id: string; name: string; code: string; level: string; _count?: { syllabus: number; assignments: number } };
type Syllabus = { id: string; title: string; description: string | null; subject?: { name: string }; class?: { name: string; section: string | null } };
type LessonPlan = { id: string; topic: string; date: string; status: string; syllabus?: { title: string; subject?: { name: string } }; teacher?: { id: string; name: string } | null };
type Assignment = { id: string; title: string; description: string | null; dueDate: string | null; subject?: { name: string }; class?: { name: string }; teacher?: { id: string; name: string } | null };
type ClassItem = { id: string; name: string; section: string | null };

type StaffMember = { id: string; name: string; role: string };

type Tab = "subjects" | "syllabus" | "plans" | "assignments";

export default function AcademicsPage() {
  const [tab, setTab] = useState<Tab>("subjects");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [syllabus, setSyllabus] = useState<Syllabus[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [message, setMessage] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);
  const [loading, setLoading] = useState(false);

  // subject form
  const [sName, setSName] = useState("");
  const [sCode, setSCode] = useState("");
  const [sLevel, setSLevel] = useState("Secondary");

  // syllabus form
  const [syClass, setSyClass] = useState("");
  const [sySubject, setSySubject] = useState("");
  const [syTitle, setSyTitle] = useState("");
  const [syDesc, setSyDesc] = useState("");

  // lesson plan form
  const [lpSyllabus, setLpSyllabus] = useState("");
  const [lpTeacher, setLpTeacher] = useState("");
  const [lpTopic, setLpTopic] = useState("");
  const [lpDate, setLpDate] = useState("");

  // assignment form
  const [aClass, setAClass] = useState("");
  const [aSubject, setASubject] = useState("");
  const [aTeacher, setATeacher] = useState("");
  const [aTitle, setATitle] = useState("");
  const [aDesc, setADesc] = useState("");
  const [aDue, setADue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, sy, lp, asg] = await Promise.all([
        apiFetch<Subject[]>("/api/academics/subjects"),
        apiFetch<Syllabus[]>("/api/academics/syllabus"),
        apiFetch<LessonPlan[]>("/api/academics/lesson-plans"),
        apiFetch<Assignment[]>("/api/academics/assignments"),
      ]);
      setSubjects(sub ?? []);
      setSyllabus(sy ?? []);
      setPlans(lp ?? []);
      setAssignments(asg ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch<ClassItem[]>("/api/classes").then((cs) => { setClasses(cs ?? []); if (cs?.length) setSyClass(cs[0].id); }).catch(() => undefined);
    apiFetch<StaffMember[]>("/api/staff").then(setStaffList).catch(() => undefined);
  }, []);

  const addSubject = async () => {
    if (!sName || !sCode) return setMessage("Name and code are required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/subjects", { method: "POST", body: JSON.stringify({ name: sName, code: sCode, level: sLevel }) });
      setSName(""); setSCode("");
      await load();
      setMessage("Subject added ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deleteSubject = async (id: string) => {
    try { await apiFetch(`/api/academics/subjects/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const addSyllabus = async () => {
    if (!syClass || !sySubject || !syTitle) return setMessage("Class, subject and title are required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/syllabus", { method: "POST", body: JSON.stringify({ class_id: syClass, subject_id: sySubject, title: syTitle, description: syDesc || undefined }) });
      setSyTitle(""); setSyDesc("");
      await load();
      setMessage("Syllabus unit added ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deleteSyllabus = async (id: string) => {
    try { await apiFetch(`/api/academics/syllabus/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const addLessonPlan = async () => {
    if (!lpSyllabus || !lpTeacher || !lpTopic || !lpDate) return setMessage("Syllabus, teacher, topic and date are required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/lesson-plans", { method: "POST", body: JSON.stringify({ syllabus_id: lpSyllabus, teacher_id: lpTeacher, topic: lpTopic, date: lpDate }) });
      setLpTopic(""); setLpDate("");
      await load();
      setMessage("Lesson plan created ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deleteLessonPlan = async (id: string) => {
    try { await apiFetch(`/api/academics/lesson-plans/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const addAssignment = async () => {
    if (!aClass || !aSubject || !aTitle) return setMessage("Class, subject and title are required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/assignments", { method: "POST", body: JSON.stringify({ class_id: aClass, subject_id: aSubject, teacher_id: aTeacher, title: aTitle, description: aDesc || undefined, due_date: aDue }) });
      setATitle(""); setADesc(""); setADue("");
      await load();
      setMessage("Assignment published — students notified ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deleteAssignment = async (id: string) => {
    try { await apiFetch(`/api/academics/assignments/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="academics"
          title="Academics"
          subtitle="Subjects, syllabus, lesson plans and assignments."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Subjects" value={subjects.length} tone="brand" icon="academics" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Syllabus Units" value={syllabus.length} tone="teal" icon="exams" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Lesson Plans" value={plans.length} tone="violet" icon="timetable" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Assignments" value={assignments.length} tone="amber" icon="reports" />
        </Reveal>
      </div>

      <Reveal delay={60}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "subjects", label: "Subjects" },
            { id: "syllabus", label: "Syllabus" },
            { id: "plans", label: "Lesson Plans" },
            { id: "assignments", label: "Assignments" },
          ]}
        />
      </Reveal>

      {tab === "subjects" && (
        <div key="subjects" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Subject name *" className="field w-auto" />
            <input value={sCode} onChange={(e) => setSCode(e.target.value)} placeholder="Code (e.g. ENG) *" className="field w-28" />
            <select value={sLevel} aria-label="Subject level" onChange={(e) => setSLevel(e.target.value)} className="field w-auto">
              {["Primary", "Secondary", "Senior Secondary"].map((l) => <option key={l}>{l}</option>)}
            </select>
            <button onClick={addSubject} disabled={loading} className="btn-primary">Add</button>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Level</th><th className="px-4 py-3">Units</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id} className="row-hover border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                    <td className="px-4 py-3 font-semibold">{s.name}</td>
                    <td className="px-4 py-3 text-xs">{s.level}</td>
                    <td className="px-4 py-3 text-xs tnum">{s._count?.syllabus ?? 0}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => deleteSubject(s.id)} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button></td>
                  </tr>
                ))}
                {subjects.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{loading ? "Loading…" : "No subjects."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "syllabus" && (
        <div key="syllabus" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <select value={syClass} aria-label="Class" onChange={(e) => setSyClass(e.target.value)} className="field w-auto">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
            </select>
            <select value={sySubject} aria-label="Subject" onChange={(e) => setSySubject(e.target.value)} className="field w-auto">
              <option value="">Subject…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input value={syTitle} onChange={(e) => setSyTitle(e.target.value)} placeholder="Unit title *" className="field w-auto" />
            <input value={syDesc} onChange={(e) => setSyDesc(e.target.value)} placeholder="Description" className="field w-auto" />
            <button onClick={addSyllabus} disabled={loading} className="btn-primary">Add</button>
          </div>
          <ul className="space-y-2">
            {syllabus.map((s) => (
              <li key={s.id} className="card card-hover flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{s.title}</span>
                <span className="text-xs text-slate-500">{s.subject?.name} · {s.class?.name} {s.class?.section ?? ""}</span>
                <button onClick={() => deleteSyllabus(s.id)} className="ml-auto btn-danger !px-2.5 !py-1 text-xs">Delete</button>
              </li>
            ))}
            {syllabus.length === 0 && <li className="card py-8 text-center text-slate-400">{loading ? "Loading…" : "No syllabus units."}</li>}
          </ul>
        </div>
      )}

      {tab === "plans" && (
        <div key="plans" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
        <div className="card flex flex-wrap items-center gap-2 p-4">
          <select value={lpSyllabus} aria-label="Syllabus unit" onChange={(e) => setLpSyllabus(e.target.value)} className="field w-auto">
            <option value="">Syllabus unit…</option>
            {syllabus.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.subject?.name}</option>)}
          </select>
          <select value={lpTeacher} aria-label="Teacher" onChange={(e) => setLpTeacher(e.target.value)} className="field w-auto">
            <option value="">Teacher…</option>
            {staffList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={lpTopic} onChange={(e) => setLpTopic(e.target.value)} placeholder="Topic *" className="field w-auto" />
          <input value={lpDate} onChange={(e) => setLpDate(e.target.value)} type="date" className="field w-auto" />
          <button onClick={addLessonPlan} disabled={loading} className="btn-primary">Create</button>
        </div>
        <ul className="space-y-2">
          {plans.map((p) => (
            <li key={p.id} className="card card-hover px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{p.topic}</span>
                <span className="text-xs text-slate-500">{p.syllabus?.title} · {p.teacher?.name}</span>
                <span className="text-xs text-slate-400">{p.date?.slice(0, 10)}</span>
                <span className="ml-auto"><Badge tone={p.status === "Completed" ? "emerald" : "amber"}>{p.status}</Badge></span>
                <button onClick={() => deleteLessonPlan(p.id)} className="btn-danger !px-2.5 !py-1 text-xs">Delete</button>
              </div>
            </li>
          ))}
          {plans.length === 0 && <li className="card py-8 text-center text-slate-400">{loading ? "Loading…" : "No lesson plans yet."}</li>}
        </ul>
        </div>
      )}

      {tab === "assignments" && (
        <div key="assignments" className="space-y-4" style={{ animation: "fade-up 0.45s var(--ease-out-soft) both" }}>
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <select value={aClass} aria-label="Class" onChange={(e) => setAClass(e.target.value)} className="field w-auto">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>)}
            </select>
            <select value={aSubject} aria-label="Subject" onChange={(e) => setASubject(e.target.value)} className="field w-auto">
              <option value="">Subject…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={aTeacher} aria-label="Teacher" onChange={(e) => setATeacher(e.target.value)} className="field w-auto">
              <option value="">Teacher…</option>
              {staffList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Assignment title *" className="field w-auto" />
            <input value={aDue} onChange={(e) => setADue(e.target.value)} type="date" className="field w-auto" />
            <button onClick={addAssignment} disabled={loading} className="btn-primary">Publish</button>
          </div>
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="card card-hover flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{a.title}</span>
                <span className="text-xs text-slate-500">{a.subject?.name} · {a.class?.name}</span>
                {a.dueDate && <span className="text-xs text-rose-500">due {a.dueDate.slice(0, 10)}</span>}
                <button onClick={() => deleteAssignment(a.id)} className="ml-auto btn-danger !px-2.5 !py-1 text-xs">Delete</button>
              </li>
            ))}
            {assignments.length === 0 && <li className="card py-8 text-center text-slate-400">{loading ? "Loading…" : "No assignments."}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
