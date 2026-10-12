"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";
import { BookOpen, FileText, ClipboardList, Plus, Trash2, Edit, Clock, AlertCircle, CheckCircle, GraduationCap } from "lucide-react";

type Subject = { id: string; name: string; code: string; level: string };
type Syllabus = { id: string; title: string; description: string | null; subject?: { name: string }; class?: { name: string; section: string | null } };
type LessonPlan = { id: string; topic: string; date: string; status: string; syllabus?: { title: string }; teacher?: { name: string } | null };
type Assignment = { id: string; title: string; description: string | null; dueDate: string | null; subject?: { name: string }; class?: { name: string }; teacher?: { name: string } | null };
type ClassItem = { id: string; name: string; section: string | null };

type Tab = "subjects" | "syllabus" | "lesson-plans" | "assignments";

export default function AcademicsPage() {
  const [tab, setTab] = useState<Tab>("subjects");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [syllabus, setSyllabus] = useState<Syllabus[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const toast = useToast();

  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", level: "Secondary" });
  const [syllabusForm, setSyllabusForm] = useState({ classId: "", subjectId: "", title: "", description: "" });
  const [lessonForm, setLessonForm] = useState({ syllabusId: "", teacherId: "", topic: "", date: "" });
  const [assignmentForm, setAssignmentForm] = useState({ classId: "", subjectId: "", teacherId: "", title: "", description: "", dueDate: "" });

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, sy, lp, asg, cls] = await Promise.all([
        apiFetch<Subject[]>("/api/academics/subjects"),
        apiFetch<Syllabus[]>("/api/academics/syllabus"),
        apiFetch<LessonPlan[]>("/api/academics/lesson-plans"),
        apiFetch<Assignment[]>("/api/academics/assignments"),
        apiFetch<ClassItem[]>("/api/classes"),
      ]);
      setSubjects(sub ?? []);
      setSyllabus(sy ?? []);
      setLessonPlans(lp ?? []);
      setAssignments(asg ?? []);
      setClasses(cls ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addSubject = async () => {
    if (!subjectForm.name || !subjectForm.code) return setMessage("Name and code required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/subjects", { method: "POST", body: JSON.stringify(subjectForm) });
      setSubjectForm({ name: "", code: "", level: "Secondary" });
      await loadAll();
      setMessage("Subject added ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deleteSubject = async (id: string) => {
    try { await apiFetch(`/api/academics/subjects/${id}`, { method: "DELETE" }); await loadAll(); } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const addSyllabus = async () => {
    if (!syllabusForm.classId || !syllabusForm.subjectId || !syllabusForm.title) return setMessage("Class, subject and title required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/syllabus", { method: "POST", body: JSON.stringify(syllabusForm) });
      setSyllabusForm({ classId: "", subjectId: "", title: "", description: "" });
      await loadAll();
      setMessage("Syllabus added ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const addLessonPlan = async () => {
    if (!lessonForm.syllabusId || !lessonForm.teacherId || !lessonForm.topic || !lessonForm.date) return setMessage("All fields required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/lesson-plans", { method: "POST", body: JSON.stringify(lessonForm) });
      setLessonForm({ syllabusId: "", teacherId: "", topic: "", date: "" });
      await loadAll();
      setMessage("Lesson plan created ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const addAssignment = async () => {
    if (!assignmentForm.classId || !assignmentForm.subjectId || !assignmentForm.title) return setMessage("Class, subject and title required");
    setLoading(true);
    try {
      await apiFetch("/api/academics/assignments", { method: "POST", body: JSON.stringify(assignmentForm) });
      setAssignmentForm({ classId: "", subjectId: "", teacherId: "", title: "", description: "", dueDate: "" });
      await loadAll();
      setMessage("Assignment published ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "--";

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader icon="academics" title="Academics" subtitle="Manage subjects, syllabus, lesson plans, and assignments" />
        </div>
        <div className="flex items-center gap-2 px-6 overflow-x-auto">
          {[
            { id: "subjects", label: "Subjects", icon: BookOpen },
            { id: "syllabus", label: "Syllabus", icon: FileText },
            { id: "lesson-plans", label: "Lesson Plans", icon: ClipboardList },
            { id: "assignments", label: "Assignments", icon: GraduationCap },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${tab === t.id ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}>
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}><div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl"><div className="flex items-center gap-3 mb-3"><BookOpen className="h-5 w-5 text-slate-500" /><span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Subjects</span></div><p className="text-3xl font-bold">{subjects.length}</p></div></Reveal>
          <Reveal delay={100}><div className="rounded-2xl bg-blue-50 border border-blue-200 p-5"><div className="flex items-center gap-3 mb-3"><FileText className="h-5 w-5 text-blue-600" /><span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Syllabus Units</span></div><p className="text-3xl font-bold text-blue-700">{syllabus.length}</p></div></Reveal>
          <Reveal delay={200}><div className="rounded-2xl bg-violet-50 border border-violet-200 p-5"><div className="flex items-center gap-3 mb-3"><ClipboardList className="h-5 w-5 text-violet-600" /><span className="text-xs font-medium text-violet-600 uppercase tracking-wide">Lesson Plans</span></div><p className="text-3xl font-bold text-violet-700">{lessonPlans.length}</p></div></Reveal>
          <Reveal delay={300}><div className="rounded-2xl bg-amber-50 border border-amber-200 p-5"><div className="flex items-center gap-3 mb-3"><GraduationCap className="h-5 w-5 text-amber-600" /><span className="text-xs font-medium text-amber-600 uppercase tracking-wide">Assignments</span></div><p className="text-3xl font-bold text-amber-700">{assignments.length}</p></div></Reveal>
        </div>

        <Reveal delay={100}>
          {/* Subjects Tab */}
          {tab === "subjects" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Add Subject</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name *</label>
                    <input value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="e.g. Mathematics" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
                    <input value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} placeholder="e.g. MATH" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <Button variant="primary" onClick={addSubject} loading={loading} className="w-full shadow-lg shadow-blue-500/20"><Plus className="h-4 w-4" /> Add Subject</Button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-50/70 border-b border-slate-200">
                      <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-5 py-3.5 whitespace-nowrap">Code</th>
                        <th className="px-4 py-3.5 whitespace-nowrap">Name</th>
                        <th className="px-4 py-3.5 whitespace-nowrap">Level</th>
                        <th className="px-5 py-3.5 whitespace-nowrap text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subjects.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{s.code}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900">{s.name}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap"><Badge tone={s.level === "Primary" ? "emerald" : s.level === "Secondary" ? "sky" : "violet"}>{s.level}</Badge></td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-right"><button onClick={() => deleteSubject(s.id)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      {subjects.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">No subjects yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Syllabus Tab */}
          {tab === "syllabus" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Add Syllabus Unit</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <select value={syllabusForm.classId} onChange={(e) => setSyllabusForm({ ...syllabusForm, classId: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Class *</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}</select>
                    <select value={syllabusForm.subjectId} onChange={(e) => setSyllabusForm({ ...syllabusForm, subjectId: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Subject *</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </div>
                  <div><input value={syllabusForm.title} onChange={(e) => setSyllabusForm({ ...syllabusForm, title: e.target.value })} placeholder="Unit title *" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                  <Button variant="primary" onClick={addSyllabus} loading={loading} className="w-full shadow-lg shadow-blue-500/20"><Plus className="h-4 w-4" /> Add Unit</Button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="max-h-[500px] overflow-y-auto">
                  {syllabus.map((s, idx) => (
                    <div key={s.id} className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-3" style={{ animation: `fade-in 0.3s ease-out ${idx * 30}ms both`, animationName: "fade-in" }}>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{s.title}</p>
                        <p className="text-xs text-slate-500">{s.subject?.name} · {s.class?.name} {s.class?.section}</p>
                      </div>
                      <button onClick={() => { /* delete syllabus */ }} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {syllabus.length === 0 && <div className="p-8 text-center text-slate-400">No syllabus units</div>}
                </div>
              </div>
            </div>
          )}

          {/* Lesson Plans Tab */}
          {tab === "lesson-plans" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Create Lesson Plan</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <select value={lessonForm.syllabusId} onChange={(e) => setLessonForm({ ...lessonForm, syllabusId: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Syllabus *</option>{syllabus.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
                    <select value={lessonForm.teacherId} onChange={(e) => setLessonForm({ ...lessonForm, teacherId: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Teacher *</option></select>
                  </div>
                  <div><input value={lessonForm.topic} onChange={(e) => setLessonForm({ ...lessonForm, topic: e.target.value })} placeholder="Topic *" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                  <div><input type="date" value={lessonForm.date} onChange={(e) => setLessonForm({ ...lessonForm, date: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                  <Button variant="primary" onClick={addLessonPlan} loading={loading} className="w-full shadow-lg shadow-blue-500/20"><ClipboardList className="h-4 w-4" /> Create Plan</Button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="max-h-[500px] overflow-y-auto">
                  {lessonPlans.map((p, idx) => (
                    <div key={p.id} className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors" style={{ animation: `fade-in 0.3s ease-out ${idx * 30}ms both`, animationName: "fade-in" }}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.status === "Completed" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                          {p.status === "Completed" ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800">{p.topic}</p>
                          <p className="text-xs text-slate-500">{p.syllabus?.title} · {p.teacher?.name}</p>
                          <p className="text-xs text-slate-400 mt-1">{fmtDate(p.date)}</p>
                        </div>
                        <Badge tone={p.status === "Completed" ? "emerald" : "amber"}>{p.status}</Badge>
                      </div>
                    </div>
                  ))}
                  {lessonPlans.length === 0 && <div className="p-8 text-center text-slate-400">No lesson plans</div>}
                </div>
              </div>
            </div>
          )}

          {/* Assignments Tab */}
          {tab === "assignments" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">Publish Assignment</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <select value={assignmentForm.classId} onChange={(e) => setAssignmentForm({ ...assignmentForm, classId: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Class *</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}</select>
                    <select value={assignmentForm.subjectId} onChange={(e) => setAssignmentForm({ ...assignmentForm, subjectId: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option value="">Subject *</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><input value={assignmentForm.title} onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })} placeholder="Assignment title *" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                    <div><input type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                  </div>
                  <div><textarea value={assignmentForm.description} onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })} placeholder="Description (optional)" rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
                  <Button variant="primary" onClick={addAssignment} loading={loading} className="w-full shadow-lg shadow-blue-500/20"><GraduationCap className="h-4 w-4" /> Publish Assignment</Button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="max-h-[500px] overflow-y-auto">
                  {assignments.map((a, idx) => (
                    <div key={a.id} className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors" style={{ animation: `fade-in 0.3s ease-out ${idx * 30}ms both`, animationName: "fade-in" }}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${!a.dueDate ? "bg-emerald-100 text-emerald-600" : new Date(a.dueDate) < new Date() ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}>
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800">{a.title}</p>
                          <p className="text-xs text-slate-500">{a.subject?.name} · {a.class?.name}</p>
                          {a.dueDate && <p className={`text-xs mt-1 ${new Date(a.dueDate) < new Date() ? "text-rose-500" : "text-amber-600"}`}>Due: {fmtDate(a.dueDate)}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {assignments.length === 0 && <div className="p-8 text-center text-slate-400">No assignments</div>}
                </div>
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </div>
  );
}

