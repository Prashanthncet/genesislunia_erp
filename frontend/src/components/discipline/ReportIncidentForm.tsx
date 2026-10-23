"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Card, CardHead, Field, Icon, Input, Select, Textarea, useToast } from "@/components/ui";
import { SEVERITIES, errMsg } from "./shared";

/** Open to every member of staff. Confidential notes are write-only for reporters. */
export function ReportIncidentForm({ students, onCreated }: {
  students: { id: string; fullName: string; admissionNo: string }[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const blank = { student_id: "", incident_date: new Date().toISOString().slice(0, 10), description: "", action_taken: "", demerits: "0", severity: "Low", confidential_notes: "" };
  const [f, setF] = useState(blank);

  const submit = async () => {
    if (!f.student_id || !f.description.trim()) return toast.push("Student and description are required", "error");
    setBusy(true);
    try {
      const res = await apiFetch<{ status: string }>("/api/discipline/incidents", {
        method: "POST",
        body: JSON.stringify({
          student_id: f.student_id, incident_date: f.incident_date, description: f.description.trim(),
          action_taken: f.action_taken || undefined, demerits: Number(f.demerits) || 0, severity: f.severity,
          confidential_notes: f.confidential_notes || undefined,
        }),
      });
      toast.push(res.status === "Escalated" ? "Reported — escalated to the Principal automatically" : "Incident reported");
      setF(blank);
      onCreated();
    } catch (e) { toast.push(errMsg(e), "error"); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHead title="Report an incident" icon="alert" subtitle="Any member of staff can report. High / Critical severity goes straight to the Principal." />
      <div className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
        <Field label="Student" required>
          <Select aria-label="Student" value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })}>
            <option value="">Select student…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
          </Select>
        </Field>
        <Field label="Date" required><Input type="date" value={f.incident_date} onChange={(e) => setF({ ...f, incident_date: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Field label="What happened" required>
            <Textarea value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
        <Field label="Action taken"><Input value={f.action_taken} maxLength={500} onChange={(e) => setF({ ...f, action_taken: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity">
            <Select aria-label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Demerits"><Input type="number" min={0} max={1000} value={f.demerits} onChange={(e) => setF({ ...f, demerits: e.target.value })} /></Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Confidential notes" hint="Only the Principal and the safeguarding team can read this back — you won't see it after submitting.">
            <Textarea value={f.confidential_notes} maxLength={2000} onChange={(e) => setF({ ...f, confidential_notes: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="px-4 pb-4">
        <Button variant="primary" onClick={submit} loading={busy}><Icon name="check" className="h-4 w-4" /> Submit report</Button>
      </div>
    </Card>
  );
}
