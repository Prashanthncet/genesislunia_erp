"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Field, Icon, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import type { NoticeAudience, NoticeDelivery, NoticeTargets } from "./types";

type StudentRow = { id: string; fullName: string; admissionNo: string; rollNo: string | null };

const empty = {
  title: "",
  body: "",
  audience: "class" as NoticeAudience,
  classId: "",
  studentId: "",
  priority: "normal" as "normal" | "important",
  expires: "",
  alsoSend: "none" as "none" | "sms" | "email",
};

/**
 * Compose a student notice. Leadership / office may address all students, any class or any
 * student; teachers and HODs only see the classes they teach or are class teacher of (the
 * server enforces the same rule — `GET /api/notices/targets` just keeps the form honest).
 */
export function NoticeComposer({
  open, onClose, onSent, presetClassId,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  presetClassId?: string;
}) {
  const toast = useToast();
  const [targets, setTargets] = useState<NoticeTargets | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setDraft({ ...empty, classId: presetClassId ?? "" });
    apiFetch<NoticeTargets>("/api/notices/targets")
      .then((t) => {
        setTargets(t);
        setDraft((d) => ({ ...d, classId: d.classId || t.classes[0]?.id || "" }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your classes"));
  }, [open, presetClassId]);

  // Students of the chosen class, for a personal notice.
  useEffect(() => {
    if (!open || draft.audience !== "student" || !draft.classId) { setStudents([]); return; }
    let live = true;
    setLoadingStudents(true);
    apiFetch<{ data: StudentRow[] }>(`/api/students?class_id=${encodeURIComponent(draft.classId)}&status=Active&page_size=200`)
      .then((r) => { if (live) setStudents(r.data ?? []); })
      .catch(() => { if (live) setStudents([]); })
      .finally(() => { if (live) setLoadingStudents(false); });
    return () => { live = false; };
  }, [open, draft.audience, draft.classId]);

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const send = async () => {
    setError("");
    if (!draft.title.trim()) return setError("Give the notice a title");
    if (!draft.body.trim()) return setError("Write the notice text");
    if (draft.audience !== "all_students" && !draft.classId) return setError("Choose a class");
    if (draft.audience === "student" && !draft.studentId) return setError("Choose a student");
    setSending(true);
    try {
      const res = await apiFetch<{ id: string; delivery: NoticeDelivery }>("/api/notices", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title.trim(),
          body: draft.body.trim(),
          audience: draft.audience,
          class_id: draft.audience === "class" ? draft.classId : undefined,
          student_id: draft.audience === "student" ? draft.studentId : undefined,
          priority: draft.priority,
          expires_at: draft.expires || undefined,
          also_send: draft.alsoSend,
        }),
      });
      const d = res.delivery;
      toast.push(
        d
          ? `Notice posted. ${d.channel.toUpperCase()}: ${d.dispatched} queued${d.skipped ? `, ${d.skipped} without a contact` : ""}${d.failed ? `, ${d.failed} failed` : ""}.`
          : "Notice posted to the student portal.",
        "success",
      );
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the notice");
    } finally {
      setSending(false);
    }
  };

  const schoolWide = targets?.school_wide ?? false;
  const noClasses = targets && !schoolWide && targets.classes.length === 0;
  const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New student notice"
      subtitle="Shows on the student and parent portal. Optionally also sent by SMS or email."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" loading={sending} disabled={!!noClasses} onClick={send}>
            <Icon name="bell" className="h-4 w-4" /> Post notice
          </Button>
        </>
      }
    >
      {noClasses ? (
        <p className="rounded-lg bg-warn-soft px-3.5 py-3 text-[13px] text-warn-ink">
          You are not timetabled for any class and are not a class teacher, so there is no class you can notify yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Send to" required>
            <Select value={draft.audience} onChange={(e) => set("audience", e.target.value as NoticeAudience)} aria-label="Notice audience">
              {schoolWide && <option value="all_students">All students</option>}
              <option value="class">A class</option>
              <option value="student">One student</option>
            </Select>
          </Field>
          {draft.audience !== "all_students" ? (
            <Field label="Class" required hint={schoolWide ? undefined : "Classes you teach or are class teacher of"}>
              <Select value={draft.classId} onChange={(e) => { set("classId", e.target.value); set("studentId", ""); }} aria-label="Class">
                <option value="">Choose a class</option>
                {(targets?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          ) : <div className="hidden sm:block" />}
          {draft.audience === "student" && (
            <div className="sm:col-span-2">
              <Field label="Student" required>
                <Select value={draft.studentId} onChange={(e) => set("studentId", e.target.value)} aria-label="Student" disabled={loadingStudents || !draft.classId}>
                  <option value="">{loadingStudents ? "Loading students…" : "Choose a student"}</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} · {s.admissionNo}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <Input value={draft.title} maxLength={150} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Science fair on Friday" aria-label="Notice title" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notice" required hint={`${draft.body.length}/4000`}>
              <Textarea rows={5} maxLength={4000} value={draft.body} onChange={(e) => set("body", e.target.value)} placeholder="What students and parents need to know" aria-label="Notice text" />
            </Field>
          </div>
          <Field label="Priority">
            <Select value={draft.priority} onChange={(e) => set("priority", e.target.value as "normal" | "important")} aria-label="Priority">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
            </Select>
          </Field>
          <Field label="Hide after" hint="Optional — the notice disappears after this day">
            <Input type="date" min={today} value={draft.expires} onChange={(e) => set("expires", e.target.value)} aria-label="Expiry date" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Also send" hint="Email goes to the student and linked parent logins; SMS to the student's registered mobile.">
              <Select value={draft.alsoSend} onChange={(e) => set("alsoSend", e.target.value as "none" | "sms" | "email")} aria-label="Also send by">
                <option value="none">Portal only</option>
                <option value="email">Portal + email</option>
                <option value="sms">Portal + SMS</option>
              </Select>
            </Field>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-[12.5px] font-medium text-danger">{error}</p>}
    </Modal>
  );
}
