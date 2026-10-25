"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, type Me } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { GATE_TYPES, classLabel, errMsg, fmtTime } from "@/components/leaves/shared";
import { ISSUE_DIRECT, type PickStudent } from "./types";

/** "YYYY-MM-DDTHH:mm" in the browser's local time (what <input type="datetime-local"> uses). */
function localStamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Issued = { id: string; status: string; student: PickStudent; type: string; out: string; back: string };

const STEPS = [
  { key: "warden", label: "Warden approval", hint: "Recorded with this action when the warden issues it." },
  { key: "principal", label: "Principal approval", hint: "Generates the pass code and texts the parent a one-time exit code." },
  { key: "gate", label: "Exit at the gate", hint: "Security scans the pass and checks the parent's code before the student leaves." },
  { key: "return", label: "Return", hint: "Security checks the student back in; late returns are flagged." },
] as const;

/** What has happened / what is next, for the pass just created. */
function NextSteps({ status }: { status: string }) {
  const done = status === "Warden Approved" ? 1 : 0;
  return (
    <ol className="space-y-3">
      {STEPS.map((s, i) => {
        const state = i < done ? "done" : i === done ? "next" : "later";
        return (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                state === "done" ? "bg-ok text-white" : state === "next" ? "bg-brand-700 text-white" : "bg-surface-2 text-ink-3 ring-1 ring-line"
              }`}
              aria-hidden
            >
              {state === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-[13px] font-semibold ${state === "later" ? "text-ink-3" : "text-ink"}`}>
                {s.label}
                {state === "done" && <span className="sr-only"> (done)</span>}
                {state === "next" && <Badge tone="amber" className="ml-2">Next</Badge>}
              </p>
              <p className="text-[12px] leading-snug text-ink-3">{s.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Gate Desk → Issue pass. Warden (or an admin) issuing here records the warden approval in the
 * same action; the principal's approval still follows (it creates the code + parent OTP).
 * Principal / VP issuing here files the pass for the warden to approve first.
 */
export function IssuePassPanel({ me, onIssued }: { me: Me; onIssued?: () => void }) {
  const toast = useToast();
  const direct = hasRole(me, ISSUE_DIRECT);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PickStudent[] | null>(null);
  const [student, setStudent] = useState<PickStudent | null>(null);
  const [form, setForm] = useState(() => ({ type: GATE_TYPES[0], reason: "", out_time: localStamp(new Date()), expected_in_time: "" }));
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState("");

  // Debounced search; empty query lists hostel residents first.
  useEffect(() => {
    let live = true;
    setOptions(null);
    const t = setTimeout(() => {
      apiFetch<PickStudent[]>(`/api/gate-passes/students${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((rows) => { if (live) setOptions(rows); })
        .catch((e) => { if (live) { setOptions([]); toast.push(errMsg(e, "Could not load students"), "error"); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, toast]);

  const backBeforeOut = !!form.expected_in_time && form.expected_in_time < form.out_time;
  const canSubmit = !!student && form.reason.trim().length > 0 && !!form.out_time && !backBeforeOut && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return setError("Pick a student first");
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch<{ id: string; status: string }>("/api/gate-passes", {
        method: "POST",
        body: JSON.stringify({
          student_id: student.id,
          type: form.type,
          reason: form.reason.trim(),
          out_time: form.out_time,
          expected_in_time: form.expected_in_time || undefined,
          ...(direct ? { issue: true } : {}),
        }),
      });
      setIssued({ id: res.id, status: res.status, student, type: form.type, out: form.out_time, back: form.expected_in_time });
      toast.push(res.status === "Warden Approved" ? "Pass issued — sent to the Principal for approval" : "Pass filed — waiting for the warden");
      setForm((f) => ({ ...f, reason: "", expected_in_time: "" }));
      setStudent(null);
      onIssued?.();
    } catch (err) {
      setError(errMsg(err, "Could not issue the pass"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-4 max-lg:grid-cols-1 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHead
          icon="door"
          title="Issue a gate pass"
          subtitle={direct
            ? "Issuing as the warden step: the pass is warden-approved immediately and goes to the Principal."
            : "Filed passes go to the warden first, then to the Principal."}
        />
        <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
          {error && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger" role="alert">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div>
            <span className="label">Student <span className="text-danger">*</span></span>
            {student ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{student.fullName}</p>
                  <p className="text-[12px] text-ink-3 max-md:break-words">
                    <span className="font-mono">{student.admissionNo}</span>
                    {classLabel(student.class) && ` · ${classLabel(student.class)}`}
                    {student.hostel && ` · ${student.hostel.name}, room ${student.hostel.room}`}
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setStudent(null)}>Change</Button>
              </div>
            ) : (
              <div className="rounded-xl border border-line">
                <div className="relative border-b border-line p-2">
                  <Icon name="search" className="pointer-events-none absolute left-4.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name or admission no."
                    aria-label="Search students by name or admission number"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                <ul className="scroll-slim max-h-64 divide-y divide-line overflow-y-auto" role="listbox" aria-label="Students">
                  {options === null && [0, 1, 2].map((i) => <li key={i} className="px-3.5 py-2.5"><Skeleton className="h-8 w-full" /></li>)}
                  {options?.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => setStudent(s)}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">{s.fullName}</span>
                          <span className="block text-[11.5px] text-ink-3 max-md:!text-[12.5px]">
                            <span className="font-mono">{s.admissionNo}</span>{classLabel(s.class) && ` · ${classLabel(s.class)}`}
                          </span>
                        </span>
                        {s.hostel ? <Badge tone="sky" className="max-md:min-w-0 max-md:max-w-[45%]"><span className="max-md:truncate">{s.hostel.name} · {s.hostel.room}</span></Badge> : <Badge tone="slate">Day scholar</Badge>}
                      </button>
                    </li>
                  ))}
                  {options?.length === 0 && <li><EmptyState icon="students" title="No matching students" hint="Try part of the name or the admission number." /></li>}
                </ul>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Pass type" required>
              <Select aria-label="Pass type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {GATE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <div className="hidden sm:block" />
            <Field label="Out time" required>
              <Input type="datetime-local" value={form.out_time} onChange={(e) => setForm({ ...form, out_time: e.target.value })} required />
            </Field>
            <Field label="Expected back" error={backBeforeOut ? "Must be after the out time" : undefined} hint="Late returns are flagged against this time.">
              <Input type="datetime-local" value={form.expected_in_time} min={form.out_time} onChange={(e) => setForm({ ...form, expected_in_time: e.target.value })} />
            </Field>
          </div>
          <Field label="Reason" required>
            <Textarea value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Dental appointment with parent" />
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit} className="max-md:w-full">
              <Icon name="check" className="h-4 w-4" />
              {direct ? "Issue pass" : "File pass"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <CardHead icon="info" title={issued ? "Pass created" : "What happens next"} subtitle={issued ? `${issued.student.fullName} · ${issued.type}` : "The approval chain every pass follows."} />
        <div className="space-y-4 p-4 sm:p-5">
          {issued && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 max-md:[&>div]:min-w-0 rounded-xl border border-line bg-surface-2/60 p-3.5 text-[12.5px]">
              <div><dt className="text-ink-3">Status</dt><dd><Badge tone={issued.status === "Warden Approved" ? "sky" : "amber"}>{issued.status}</Badge></dd></div>
              <div><dt className="text-ink-3">Admission no</dt><dd className="font-mono font-medium">{issued.student.admissionNo}</dd></div>
              <div><dt className="text-ink-3">Out</dt><dd className="tnum font-medium">{fmtTime(issued.out)}</dd></div>
              <div><dt className="text-ink-3">Back by</dt><dd className="tnum font-medium">{fmtTime(issued.back || null)}</dd></div>
            </dl>
          )}
          <NextSteps status={issued?.status ?? (direct ? "Warden Approved" : "Pending")} />
          <p className="text-[12px] leading-relaxed text-ink-3">
            The parent is only contacted once the Principal approves — that message carries the one-time exit code.
          </p>
        </div>
      </Card>
    </div>
  );
}
