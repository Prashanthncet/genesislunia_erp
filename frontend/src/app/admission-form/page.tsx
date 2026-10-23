"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BASE } from "@/lib/api";
import { Badge, Button, Field, Icon, ProgressBar, Reveal, Skeleton, ToastHost, useToast } from "@/components/ui";
import { useRouteMeta } from "@/components/RouteMeta";
import { fmtDate, inr, readUpload } from "@/components/admissions/shared";

type FormField = { id: string; key: string; label: string; field_type: string; is_required: boolean; validation_rule: string | null };
type Doc = { id: string; docType: string; fileName: string; sizeBytes: number };
type FormData = {
  application_id: string;
  school: string | null;
  academic_year: string;
  status: string;
  editable: boolean;
  remarks: string | null;
  link_expires_at: string | null;
  student_name: string | null;
  parent_name: string | null;
  login_id: string | null;
  fields: FormField[];
  classes: { id: string; name: string; section: string | null }[];
  dynamic_data: Record<string, string>;
  documents: Doc[];
  payment: { can_pay: boolean; amount: number | null; status: string; last_order: { gateway: string; status: string } | null };
};
type Order = { order_id: string; gateway: "mock" | "razorpay"; amount: number; amount_minor: number; currency: string; key_id?: string };

const DOC_TYPES = [
  { id: "photo", label: "Passport photo" },
  { id: "birth_certificate", label: "Birth certificate" },
  { id: "aadhaar", label: "Aadhaar" },
  { id: "marksheet", label: "Previous marksheet" },
  { id: "transfer_certificate", label: "Transfer certificate" },
  { id: "other", label: "Other" },
];

const STEPS = ["Submitted by Parent", "Document Validated", "Payment Received", "Fee Approved", "Roll No Assigned", "VP Approved", "Admission Complete"];

/** "^(A|B|C)$" or "A|B|C" → ["A","B","C"] for select fields. */
const optionsOf = (rule: string | null) =>
  (rule ?? "").replace(/^\^?\(?/, "").replace(/\)?\$?$/, "").split("|").map((s) => s.trim()).filter(Boolean);

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message) ? body.message.join(" · ") : body.message ?? body.error ?? res.statusText;
    throw new HttpError(res.status, msg);
  }
  return res.json();
}

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window"));
    document.body.appendChild(s);
  });
}

function AdmissionFormInner() {
  const params = useSearchParams();
  useRouteMeta("/admission-form");
  const token = params.get("token") ?? "";
  const toast = useToast();
  const [data, setData] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ready" | "submitted" | "expired" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "submit" | "draft" | "upload" | "pay">("");
  const [docType, setDocType] = useState("photo");
  const [order, setOrder] = useState<Order | null>(null);

  // keepValues: refresh server state (documents, status) without overwriting what the
  // parent has typed but not saved yet — uploading a scan used to wipe the whole form.
  const load = useCallback(async (opts?: { keepValues?: boolean }) => {
    if (!token) {
      setError("This page needs the admission link sent to you by the school.");
      setState("error");
      return;
    }
    try {
      const d = await call<FormData>(`/api/admissions/public/${encodeURIComponent(token)}`);
      setData(d);
      if (opts?.keepValues) setValues((v) => ({ ...d.dynamic_data, ...v }));
      else setValues({ ...d.dynamic_data });
      setState("ready");
    } catch (e) {
      if (e instanceof HttpError && e.status === 410) setState("expired");
      else {
        setError(e instanceof HttpError && e.status === 404 ? "This admission link is not valid. Please use the latest link from the school." : (e as Error).message);
        setState("error");
      }
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const fail = (e: unknown) => {
    if (e instanceof HttpError && e.status === 410) return setState("expired");
    toast.push(e instanceof Error ? e.message : "Something went wrong", "error");
    if (e instanceof HttpError && e.status === 409) void load();
  };

  const submit = async (draft: boolean) => {
    setBusy(draft ? "draft" : "submit");
    try {
      await call(`/api/admissions/public/${encodeURIComponent(token)}/${draft ? "draft" : "submit"}`, { method: "POST", body: JSON.stringify(values) });
      if (draft) toast.push("Saved. You can come back to this link to finish.", "success");
      else {
        setState("submitted");
        toast.push("Application submitted", "success");
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const data_url = await readUpload(file);
      await call(`/api/admissions/public/${encodeURIComponent(token)}/documents`, {
        method: "POST",
        body: JSON.stringify({ doc_type: docType, file_name: file.name, data_url }),
      });
      toast.push(`${file.name} uploaded`, "success");
      await load({ keepValues: true });
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  const removeDoc = async (id: string) => {
    try {
      await call(`/api/admissions/public/${encodeURIComponent(token)}/documents/${id}`, { method: "DELETE" });
      await load({ keepValues: true });
    } catch (e) {
      fail(e);
    }
  };

  const pay = async () => {
    setBusy("pay");
    try {
      const o = await call<Order>(`/api/admissions/public/${encodeURIComponent(token)}/pay`, { method: "POST" });
      if (o.gateway === "mock") {
        setOrder(o);
        return;
      }
      await loadRazorpay();
      if (!window.Razorpay) throw new Error("Payment window unavailable");
      new window.Razorpay({
        key: o.key_id,
        amount: o.amount_minor,
        currency: o.currency,
        order_id: o.order_id,
        name: data?.school ?? "School admission",
        description: `Admission fee ${data?.academic_year ?? ""}`,
        prefill: { name: data?.parent_name ?? "" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await call("/api/payments/razorpay/verify", { method: "POST", body: JSON.stringify(resp) });
            toast.push("Payment received — thank you", "success");
          } catch (e) {
            toast.push(`Payment done but confirmation is pending: ${(e as Error).message}`, "info");
          }
          await load();
        },
      }).open();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  const simulate = async () => {
    if (!order) return;
    setBusy("pay");
    try {
      await call(`/api/payments/mock/${encodeURIComponent(order.order_id)}/complete`, { method: "POST" });
      toast.push("Test payment completed", "success");
      setOrder(null);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  const fields = data?.fields ?? [];
  const missing = fields.filter((f) => f.is_required && !(values[f.key] ?? "").trim());
  const filled = fields.filter((f) => (values[f.key] ?? "").trim()).length;
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  return (
    <main className="mx-auto max-w-xl overflow-x-clip px-4 py-10">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <span className="absolute left-[12%] top-[-8rem] h-72 w-72 animate-[float_9s_ease-in-out_infinite] rounded-full bg-brand-400/20 blur-3xl" />
        <span className="absolute right-[6%] top-[20%] h-64 w-64 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-accent-400/25 blur-3xl" />
      </div>

      <Reveal>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lift"
            style={{ animation: "scale-in 0.5s var(--ease-spring) both" }}>
            <Icon name="admissions" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Admission Form</h1>
          <p className="mt-1 text-sm text-ink-2">{data?.school ?? "School"}{data ? ` — ${data.academic_year}` : ""}</p>
        </div>
      </Reveal>

      {state === "loading" && (
        <div className="card space-y-3 p-6" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      )}

      {state === "error" && (
        <div role="alert" className="card border-danger-line bg-danger-soft/80 p-6 text-center">
          <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-xl bg-danger-soft text-danger"><Icon name="alert" /></span>
          <p className="text-sm font-semibold text-danger-ink">{error}</p>
        </div>
      )}

      {state === "expired" && (
        <div role="alert" className="card border-warn-line bg-warn-soft/80 p-6 text-center">
          <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-xl bg-warn-soft text-warn"><Icon name="clock" /></span>
          <h2 className="text-base font-bold text-warn-ink">This link has expired</h2>
          <p className="mt-1 text-sm text-warn-ink">Admission links are valid for 15 days. Please contact the admission office to get a new link.</p>
        </div>
      )}

      {state === "submitted" && (
        <div className="card border-ok-line bg-ok-soft/80 p-8 text-center" style={{ animation: "scale-in 0.45s var(--ease-spring) both" }}>
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-ok text-white shadow-lift">
            <Icon name="check" className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <h2 className="text-lg font-bold text-ok-ink">Application submitted</h2>
          <p className="mt-1 text-sm text-ok-ink">
            Thank you. The admission office will verify the documents. You will get a message to pay the fee once they are verified —
            open this same link, or sign in to the parent portal{data?.login_id ? ` with login ID ${data.login_id}` : ""}.
          </p>
          <Button variant="soft" className="mt-4" onClick={() => void load()}>Check status</Button>
        </div>
      )}

      {state === "ready" && data && !data.editable && (
        <Reveal delay={40}>
          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[12px] uppercase tracking-wide text-ink-3">Application for</p>
                <p className="text-lg font-bold text-ink">{data.student_name ?? "—"}</p>
              </div>
              <Badge tone={data.status === "Rejected" ? "rose" : data.status === "Admission Complete" ? "emerald" : "sky"}>{data.status}</Badge>
            </div>
            {data.status !== "Rejected" && (
              <ProgressBar value={((Math.max(0, STEPS.indexOf(data.status)) + 1) / STEPS.length) * 100}
                tone={data.status === "Admission Complete" ? "emerald" : "brand"}
                label={`Step ${Math.max(0, STEPS.indexOf(data.status)) + 1} of ${STEPS.length}`} />
            )}
            {data.status === "Rejected" && data.remarks && <p className="text-sm text-danger-ink">{data.remarks}</p>}

            {data.payment.can_pay && (
              <div className="rounded-xl border border-line bg-surface-2/70 p-4">
                <p className="text-sm font-semibold text-ink">Documents verified — admission fee due</p>
                <p className="mt-0.5 text-2xl font-bold tnum text-ink">{inr(data.payment.amount)}</p>
                {!order ? (
                  <Button variant="primary" className="mt-3 w-full" loading={busy === "pay"} onClick={pay}>
                    <Icon name="wallet" className="h-4 w-4" /> Pay admission fee
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn-ink">
                      Test mode: no payment gateway is configured, so no money moves. Use the button below to simulate a successful payment.
                    </p>
                    <Button variant="primary" className="w-full" loading={busy === "pay"} onClick={simulate}>Simulate payment of {inr(order.amount)}</Button>
                  </div>
                )}
              </div>
            )}
            {!data.payment.can_pay && data.status !== "Rejected" && data.status !== "Admission Complete" && (
              <p className="text-sm text-ink-2">
                {data.status === "Submitted by Parent" ? "Your form is with the admission office for document verification." : "Your fee is received. The school is completing the remaining approvals."}
              </p>
            )}
            {data.status === "Admission Complete" && (
              <p className="text-sm text-ok-ink">
                Admission confirmed. Sign in to the parent portal{data.login_id ? ` (login ID ${data.login_id})` : ""} to download the admission letter.
              </p>
            )}
            <a href="/login" className="btn-soft w-full justify-center">Parent portal sign-in</a>
          </div>
        </Reveal>
      )}

      {state === "ready" && data && data.editable && (
        <Reveal delay={60}>
          <div className="card space-y-4 p-6">
            {data.status === "Re-submit" && (
              <div role="status" className="rounded-xl border border-warn-line bg-warn-soft/80 px-3.5 py-2.5 text-[13px] text-warn-ink">
                <b>The school asked for changes:</b> {data.remarks ?? "please review and resubmit."}
              </div>
            )}
            {data.link_expires_at && (
              <p className="text-[12.5px] text-ink-3"><Icon name="clock" className="mr-1 inline h-3.5 w-3.5" />This link is valid until <b>{fmtDate(data.link_expires_at)}</b>.</p>
            )}

            {fields.length > 0 && (
              <div className="rounded-xl bg-surface-2/80 px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-2">
                  <span>{filled} of {fields.length} answered</span>
                  {missing.length > 0 && <span className="text-warn">{missing.length} required left</span>}
                </div>
                <ProgressBar value={(filled / fields.length) * 100} tone={missing.length ? "amber" : "emerald"} />
              </div>
            )}

            {fields.map((f) => (
              <Field key={f.id} label={f.label} required={f.is_required}>
                {f.field_type === "textarea" ? (
                  <textarea rows={2} value={values[f.key] ?? ""} maxLength={500} onChange={(e) => set(f.key, e.target.value)} className="field resize-y" />
                ) : f.field_type === "select" && optionsOf(f.validation_rule).length > 0 ? (
                  <select aria-label={f.label} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="field">
                    <option value="">Select…</option>
                    {optionsOf(f.validation_rule).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={{ number: "number", date: "date", email: "email", phone: "tel" }[f.field_type] ?? "text"}
                    value={values[f.key] ?? ""}
                    maxLength={500}
                    pattern={f.validation_rule && f.field_type !== "select" ? f.validation_rule.replace(/^\^|\$$/g, "") : undefined}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="field"
                  />
                )}
              </Field>
            ))}
            {fields.length === 0 && <p className="text-sm text-ink-3">The school has not published the form for this year yet.</p>}

            {data.classes.length > 0 && (
              <Field label="Class applied for">
                <select aria-label="Class applied for" value={values.class_id ?? ""} onChange={(e) => set("class_id", e.target.value)} className="field">
                  <option value="">Select…</option>
                  {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` - ${c.section}` : ""}</option>)}
                </select>
              </Field>
            )}

            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-sm font-semibold text-ink">Documents</p>
              <p className="text-[12px] text-ink-3">JPEG, PNG, WebP or PDF, up to 5 MB each.</p>
              {data.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
                  <span><b>{DOC_TYPES.find((t) => t.id === d.docType)?.label ?? d.docType}</b> <span className="text-ink-3">{d.fileName}</span></span>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => removeDoc(d.id)} aria-label={`Remove ${d.fileName}`}>Remove</button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} className="field w-auto">
                  {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <label className={`btn-soft cursor-pointer ${busy === "upload" ? "pointer-events-none opacity-50" : ""}`}>
                  <Icon name="upload" className="h-4 w-4" /> {busy === "upload" ? "Uploading…" : "Upload file"}
                  <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="soft" className="sm:flex-1" loading={busy === "draft"} onClick={() => submit(true)}>Save draft</Button>
              <Button variant="primary" className="sm:flex-[2]" loading={busy === "submit"} disabled={missing.length > 0 || fields.length === 0} onClick={() => submit(false)}>
                <Icon name="check" className="h-4 w-4" /> Submit application
              </Button>
            </div>
            {missing.length > 0 && <p className="text-[12px] text-ink-3">Still required: {missing.map((f) => f.label).join(", ")}</p>}
          </div>
        </Reveal>
      )}
    </main>
  );
}

export default function AdmissionFormPage() {
  return (
    <ToastHost>
      <Suspense fallback={<p className="p-10 text-center text-ink-3">Loading…</p>}>
        <AdmissionFormInner />
      </Suspense>
    </ToastHost>
  );
}
