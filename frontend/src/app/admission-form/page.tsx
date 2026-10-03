"use client";

import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, Icon, ProgressBar, Reveal, Skeleton, ToastHost, useToast } from "@/components/ui";
import { useRouteMeta } from "@/components/RouteMeta";

type Field = { id: string; label: string; fieldType: string; isRequired: boolean; validationRule: string | null };
type FormData = {
  application_id: string;
  status: string;
  student_name: string | null;
  already_submitted: boolean;
  fields: Field[];
  dynamic_data: Record<string, unknown>;
};

function AdmissionFormInner() {
  const params = useSearchParams();
  useRouteMeta("/admission-form");
  const token = params.get("token") ?? "";
  const [data, setData] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.push(error, "error");
  }, [error, toast]);

  useEffect(() => {
    if (!token) {
      setError("Missing admission link token");
      setStatus("error");
      return;
    }
    fetch(`/api/admissions/public/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Invalid link");
        return res.json();
      })
      .then((d: FormData) => {
        setData(d);
        const initial: Record<string, string> = {};
        for (const [k, v] of Object.entries(d.dynamic_data ?? {})) initial[k] = String(v ?? "");
        setValues(initial);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load form");
        setStatus("error");
      });
  }, [token]);

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...values };
      const res = await fetch(`/api/admissions/public/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Submit failed");
      setStatus("done");
      toast.push("Application submitted successfully", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filled = data
    ? data.fields.filter((f) => (values[f.label] ?? "").trim() !== "").length
    : 0;
  const requiredMissing = data
    ? data.fields.filter((f) => f.isRequired && (values[f.label] ?? "").trim() === "").map((f) => f.label)
    : [];

  return (
    <main className="mx-auto max-w-xl px-4 py-10 overflow-x-clip">
      {/* Ambient orbs — same treatment as the dashboard shell */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <span className="absolute left-[12%] top-[-8rem] h-72 w-72 animate-[float_9s_ease-in-out_infinite] rounded-full bg-brand-400/20 blur-3xl" />
        <span className="absolute right-[6%] top-[20%] h-64 w-64 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-accent-400/25 blur-3xl" />
      </div>

      <Reveal>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-black text-white shadow-lift"
            style={{ animation: "scale-in 0.5s var(--ease-spring) both" }}>
            GL
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Admission Form</h1>
          <p className="mt-1 text-sm text-slate-500">Genesis Lumia School — parent portal</p>
        </div>
      </Reveal>

      {status === "loading" && (
        <div className="card space-y-3 p-6" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {status === "error" && (
        <Reveal>
          <div role="alert" className="card border-rose-200 bg-rose-50/80 p-6 text-center">
            <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-rose-100 text-rose-600">
              <Icon name="alert" />
            </span>
            <p className="text-sm font-semibold text-rose-700">{error}</p>
          </div>
        </Reveal>
      )}

      {status === "done" && (
        <Reveal>
          <div className="card border-emerald-200 bg-emerald-50/80 p-8 text-center" style={{ animation: "scale-in 0.45s var(--ease-spring) both" }}>
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lift"
              style={{ animation: "pulse-ring 2.4s var(--ease-out-soft) infinite" }}>
              <Icon name="check" className="h-7 w-7" strokeWidth={2.5} />
            </span>
            <h2 className="text-lg font-bold text-emerald-800">Application submitted</h2>
            <p className="mt-1 text-sm text-emerald-700">
              The school office will contact you for the next steps (document validation &amp; fee payment).
            </p>
          </div>
        </Reveal>
      )}

      {status === "ready" && data && (
        <Reveal delay={60}>
        <div className="card space-y-4 p-6">
          {data.already_submitted && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs font-semibold text-amber-700">
              This application was already submitted (status: {data.status}). You can re-submit to update the answers.
            </div>
          )}

          {data.fields.length > 0 && (
            <div className="rounded-xl bg-slate-50/80 px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>{filled} of {data.fields.length} answered</span>
                {requiredMissing.length > 0 && (
                  <span className="text-amber-600">{requiredMissing.length} required left</span>
                )}
              </div>
              <ProgressBar value={(filled / data.fields.length) * 100} tone={requiredMissing.length ? "amber" : "emerald"} />
            </div>
          )}
          {data.fields.map((f) => (
            <div key={f.id}>
              <Field
                label={f.label}
                required={f.isRequired}
                hint={f.isRequired && requiredMissing.includes(f.label) ? "This answer is required" : undefined}
              >
                {f.fieldType === "textarea" ? (
                  <textarea
                    rows={2}
                    value={values[f.label] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.label]: e.target.value })}
                    className="field resize-y"
                  />
                ) : f.fieldType === "select" && f.validationRule ? (
                  <select
                    value={values[f.label] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.label]: e.target.value })}
                    className="field"
                  >
                    <option value="">Select…</option>
                    {f.validationRule.split("|").map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.fieldType === "number" ? "number" : f.fieldType === "date" ? "date" : "text"}
                    value={values[f.label] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.label]: e.target.value })}
                    className="field"
                  />
                )}
              </Field>
            </div>
          ))}
          {data.fields.length === 0 && (
            <p className="text-sm text-slate-400">The school has not configured form fields yet.</p>
          )}
          <Button variant="primary" onClick={submit} loading={submitting} className="w-full">
            <Icon name="check" className="h-4 w-4" /> Submit Application
          </Button>
        </div>
        </Reveal>
      )}
    </main>
  );
}

export default function AdmissionFormPage() {
  return (
    <ToastHost>
      <Suspense fallback={<p className="p-10 text-center text-slate-400">Loading…</p>}>
        <AdmissionFormInner />
      </Suspense>
    </ToastHost>
  );
}
