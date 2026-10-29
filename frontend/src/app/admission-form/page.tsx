"use client";

/**
 * Public parent-facing admission form (/admission-form?token=...) — Google Forms-style UI.
 * Unauthenticated, gated by the 15-day link token. Also displays a scannable QR code so
 * parents can seamlessly switch to their phone (e.g. to snap document photos) or continue
 * inside the Parent Portal.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BASE } from "@/lib/api";
import { Badge, Button, Field, Icon, Input, ProgressBar, Reveal, Select, Skeleton, ToastHost, useToast } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
import { STATUS_TONE, fmtDate, inr, readUpload } from "@/components/admissions/shared";
import {
  sanitizeDynamicValue,
  validateDynamicField,
  validateAllDynamicFields,
  isPhoneLabel,
  isAadhaarLabel,
  isPinCodeLabel,
} from "@/lib/validation";
import { makeQrDataUrl, downloadQrPng } from "@/lib/qr";

type PublicField = { id: string; key: string; label: string; field_type: string; is_required: boolean; validation_rule: string | null };
type Doc = { id: string; docType: string; fileName: string; sizeBytes: number };
type FormData = {
  application_id: string;
  school: string | null;
  academic_year: string;
  status: string;
  editable: boolean;
  already_submitted: boolean;
  remarks: string | null;
  link_expires_at: string | null;
  student_name: string | null;
  parent_name: string | null;
  login_id: string | null;
  form_link?: string | null;
  qr_data_url?: string | null;
  fields: PublicField[];
  classes: { id: string; name: string; section: string | null }[];
  dynamic_data: Record<string, string>;
  documents: Doc[];
  payment: { can_pay: boolean; amount: number | null; status: string; last_order: { gateway: string; status: string; amount: number } | null };
};

type PayOrder = {
  order_id: string;
  gateway: "mock" | "razorpay" | "payu";
  gateway_order_id: string;
  amount: number;
  currency: string;
  checkout: { key_id?: string };
};

const DOC_TYPES = [
  { id: "birth_certificate", label: "Birth certificate" },
  { id: "photo", label: "Student photograph" },
  { id: "aadhar", label: "Aadhaar / ID proof" },
  { id: "report_card", label: "Previous report card" },
  { id: "transfer_certificate", label: "Transfer certificate" },
  { id: "other", label: "Other document" },
];

async function pub<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/admissions/public${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = body?.message;
    const err = new Error(Array.isArray(m) ? m.join(" · ") : (m || `Request failed (${res.status})`)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

/** `^(A|B|C)$` → `['A','B','C']` for `select` fields. */
function optionsOf(rule: string | null): string[] {
  if (!rule) return [];
  const inner = rule.replace(/^\^\(?|\)?\$$/g, "");
  return inner.includes("|") ? inner.split("|").map((s) => s.replace(/\\\+/g, "+").trim()).filter(Boolean) : [];
}

function AdmissionFormInner() {
  const token = useSearchParams().get("token") ?? "";
  const { push: notify } = useToast();
  const [data, setData] = useState<FormData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "invalid">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [docType, setDocType] = useState("birth_certificate");
  const [busy, setBusy] = useState<string | null>(null);
  const [order, setOrder] = useState<PayOrder | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [questionFilter, setQuestionFilter] = useState<"all" | "unanswered" | "required">("all");
  const [searchField, setSearchField] = useState("");

  const load = useCallback(async () => {
    if (!token) { setState("invalid"); return; }
    try {
      const d = await pub<FormData>(`/${encodeURIComponent(token)}`);
      setData(d);
      setValues((prev) => (Object.keys(prev).length ? prev : d.dynamic_data));
      setState("ready");
    } catch (e) {
      const err = e as Error & { status?: number };
      setErrMsg(err.message);
      setState(err.status === 410 ? "expired" : "invalid");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const set = (k: string, v: string, field?: PublicField) => {
    const cleanVal = field ? sanitizeDynamicValue(field, v) : v;
    setValues((p) => ({ ...p, [k]: cleanVal }));
    if (field) {
      setFieldErrors((prev) => ({
        ...prev,
        [k]: validateDynamicField(field, cleanVal),
      }));
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const data_url = await readUpload(file);
      await pub(`/${encodeURIComponent(token)}/documents`, {
        method: "POST",
        body: JSON.stringify({ doc_type: docType, file_name: file.name, data_url }),
      });
      notify("Document uploaded");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const removeDoc = async (docId: string, fileName?: string) => {
    const ok = await confirmAction({
      title: `Remove ${fileName ?? "this document"}?`,
      text: "You can upload a replacement before submitting the form.",
      confirmText: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await pub(`/${encodeURIComponent(token)}/documents/${docId}`, { method: "DELETE" });
      notify("Document removed");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not remove document", "error");
    }
  };

  const submit = async (draft: boolean) => {
    if (!draft && data) {
      setSubmitAttempted(true);
      const allErrs = validateAllDynamicFields(data.fields, values);
      const errKeys = Object.keys(allErrs);
      if (errKeys.length > 0) {
        setFieldErrors(allErrs);
        notify(`Please fix ${errKeys.length} validation error${errKeys.length === 1 ? "" : "s"}: ${allErrs[errKeys[0]]}`, "error");
        return;
      }
      const ok = await confirmAction({
        title: "Verify & submit admission application?",
        text: "All fields have been verified. Your form and uploaded documents will be sent to the admission office for verification.",
        confirmText: "Verify & submit",
      });
      if (!ok) return;
    }
    setBusy(draft ? "draft" : "submit");
    try {
      const res = await pub<{ message: string }>(`/${encodeURIComponent(token)}/${draft ? "draft" : "submit"}`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      notify(res.message);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Submission failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const startPayment = async () => {
    setBusy("pay");
    try {
      setOrder(await pub<PayOrder>(`/${encodeURIComponent(token)}/pay`, { method: "POST" }));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not start payment", "error");
    } finally {
      setBusy(null);
    }
  };

  const simulatePaid = async (status: "paid" | "failed") => {
    if (!order) return;
    setBusy("sim");
    try {
      const res = await fetch(`${BASE}/api/payments/webhook/mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway_order_id: order.gateway_order_id, payment_id: `pay_${Date.now()}`, status }),
      });
      if (!res.ok) throw new Error("Payment confirmation failed");
      notify(status === "paid" ? "Payment received — thank you!" : "Marked as failed — you can retry", status === "paid" ? "success" : "error");
      setOrder(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Payment failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const fields = data?.fields ?? [];
  const filled = fields.filter((f) => (values[f.key] ?? "").trim().length > 0).length;
  const missing = fields.filter((f) => f.is_required && !(values[f.key] ?? "").trim());
  const validationErrorsMap = useMemo(() => validateAllDynamicFields(fields, values), [fields, values]);
  const invalidCount = Object.keys(validationErrorsMap).length;

  const visibleFields = useMemo(() => {
    const q = searchField.trim().toLowerCase();
    return fields.filter((f) => {
      if (q && !f.label.toLowerCase().includes(q)) return false;
      if (questionFilter === "unanswered" && (values[f.key] ?? "").trim().length > 0) return false;
      if (questionFilter === "required" && !f.is_required) return false;
      return true;
    });
  }, [fields, searchField, questionFilter, values]);

  const resolvedFormUrl =
    data?.form_link ||
    (typeof window !== "undefined" ? window.location.href : "");
  const qrSrc = useMemo(
    () => data?.qr_data_url || (resolvedFormUrl ? makeQrDataUrl(resolvedFormUrl, 240) : ""),
    [data?.qr_data_url, resolvedFormUrl],
  );

  const copyLink = () => {
    if (!resolvedFormUrl) return;
    void navigator.clipboard?.writeText(resolvedFormUrl).then(() => notify("Form link copied"), () => notify("Could not copy", "error"));
  };

  const downloadQr = () => {
    if (!resolvedFormUrl) return;
    downloadQrPng(resolvedFormUrl, `admission-form-qr-${data?.academic_year ?? "form"}.png`);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 max-md:px-3 max-md:py-5">
      {/* Google Forms-style Top Banner Card */}
      <Reveal>
        <div className="card mb-5 overflow-hidden border-t-[8px] border-t-brand-700 p-6 shadow-sm max-md:p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                  <Icon name="admissions" className="h-3.5 w-3.5" /> Official Admission Form
                </span>
                {data && <Badge tone={STATUS_TONE[data.status] ?? "slate"}>{data.status}</Badge>}
              </div>
              <h1 className="font-display text-[24px] font-extrabold tracking-tight text-ink max-md:text-[20px]">
                {data?.school ?? "Sainik School · Genesis ERP"} — Admission {data?.academic_year ?? ""}
              </h1>
              <p className="text-[13px] text-ink-3">
                {data?.parent_name ? `Welcome, ${data.parent_name}. ` : ""}
                Complete the form below or sign in to the{" "}
                <a href="/login" className="font-semibold text-brand-700 underline underline-offset-2">
                  Parent Portal
                </a>
                {data?.login_id ? ` (Login ID: ${data.login_id})` : ""} to fill and track your application anytime.
              </p>
            </div>

            {qrSrc && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="soft" onClick={() => setShowQr((s) => !s)}>
                  <Icon name="qr" className="h-4 w-4" /> {showQr ? "Hide QR" : "Form QR Code"}
                </Button>
                <Button size="sm" variant="ghost" onClick={copyLink}>
                  <Icon name="copy" className="h-4 w-4" /> Copy Link
                </Button>
              </div>
            )}
          </div>

          {showQr && qrSrc && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="Admission Form QR Code" className="h-24 w-24 rounded-xl border border-line bg-white p-1.5 shadow-2xs" />
                <div className="space-y-1">
                  <p className="text-[13.5px] font-bold text-ink">Scan to Open on Your Phone</p>
                  <p className="max-w-md text-[12px] text-ink-2">
                    Scan this QR code with your phone camera to continue filling the form or snap and upload student documents directly from your mobile device.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="soft" onClick={downloadQr}>
                <Icon name="download" className="h-4 w-4" /> Download QR
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12px]">
            <span className="font-semibold text-danger">* Indicates required question</span>
            {data?.link_expires_at && (
              <span className="text-ink-3">
                <Icon name="clock" className="mr-1 inline h-3.5 w-3.5" /> Link valid until <b>{fmtDate(data.link_expires_at)}</b>
              </span>
            )}
          </div>
        </div>
      </Reveal>

      {state === "loading" && (
        <div className="card space-y-3 p-6"><Skeleton className="h-6 w-48" /><Skeleton className="h-32 w-full" /></div>
      )}

      {state === "expired" && (
        <div className="card border-l-4 border-l-danger p-6 max-md:p-4">
          <h2 className="font-display text-lg font-bold text-ink">This admission link has expired</h2>
          <p className="mt-1 text-sm text-ink-2">{errMsg || "Admission links are valid for 15 days. Please contact the school admission office to re-issue your link."}</p>
        </div>
      )}

      {state === "invalid" && (
        <div className="card border-l-4 border-l-danger p-6 max-md:p-4">
          <h2 className="font-display text-lg font-bold text-ink">Invalid admission link</h2>
          <p className="mt-1 text-sm text-ink-2">{errMsg || "Please open the exact link sent by the school or sign in to the Parent Portal."}</p>
          <a href="/login" className="btn-primary mt-4 inline-flex">Sign in to Parent Portal</a>
        </div>
      )}

      {state === "ready" && data && !data.editable && (
        <Reveal delay={60}>
          <div className="card space-y-4 p-6 max-md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-ink">{data.student_name ?? "Application"}</h2>
              <Badge tone={STATUS_TONE[data.status] ?? "sky"}>{data.status}</Badge>
            </div>
            {data.remarks && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2"><b>Remarks:</b> {data.remarks}</p>
            )}
            {data.payment.can_pay && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                <p className="font-display text-base font-bold text-ink">Documents verified — admission fee due</p>
                <p className="mt-0.5 text-sm text-ink-2">Amount: <b>{inr(data.payment.amount)}</b></p>
                {!order ? (
                  <Button variant="primary" className="mt-3" loading={busy === "pay"} onClick={startPayment}>
                    <Icon name="wallet" className="h-4 w-4" /> Pay admission fee online
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2 rounded-lg bg-surface p-3 text-sm">
                    <p>Order <span className="font-mono">{order.gateway_order_id}</span> · gateway <b>{order.gateway}</b> · {inr(order.amount)}</p>
                    {order.gateway === "mock" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="primary" loading={busy === "sim"} onClick={() => simulatePaid("paid")}>Complete payment</Button>
                        <Button variant="soft" loading={busy === "sim"} onClick={() => simulatePaid("failed")}>Simulate failure</Button>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-3">Complete the payment in the {order.gateway} checkout window; this page updates automatically once the webhook arrives.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {!data.payment.can_pay && data.status !== "Rejected" && data.status !== "Admission Complete" && (
              <p className="text-sm text-ink-2">
                {data.status === "Submitted by Parent"
                  ? "Your form has been submitted and is with the admission office for document verification."
                  : "Your fee is received. The school is completing the remaining approvals."}
              </p>
            )}
            {data.status === "Admission Complete" && (
              <p className="text-sm text-ok-ink">
                Admission confirmed! Sign in to the Parent Portal{data.login_id ? ` (Login ID ${data.login_id})` : ""} to download the official admission letter.
              </p>
            )}
            <a href="/login" className="btn-soft w-full justify-center">Open Parent Portal</a>
          </div>
        </Reveal>
      )}

      {state === "ready" && data && data.editable && (
        <Reveal delay={60}>
          <div className="space-y-4">
            {data.status === "Re-submit" && (
              <div role="status" className="card border-l-4 border-l-warn bg-warn-soft/80 p-4 text-[13px] text-warn-ink">
                <b>The school requested corrections:</b> {data.remarks ?? "Please review your answers and resubmit."}
              </div>
            )}

            {/* Progress & Question Filter Bar */}
            {fields.length > 0 && (
              <div className="card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-2">
                  <span>Progress: <b>{filled}</b> of <b>{fields.length}</b> questions answered</span>
                  {missing.length > 0 ? (
                    <span className="text-warn">{missing.length} required question{missing.length === 1 ? "" : "s"} remaining</span>
                  ) : invalidCount > 0 ? (
                    <span className="text-danger">{invalidCount} validation error{invalidCount === 1 ? "" : "s"} to fix</span>
                  ) : (
                    <span className="text-ok-ink">All required questions verified ✓</span>
                  )}
                </div>
                <ProgressBar value={(filled / fields.length) * 100} tone={missing.length || invalidCount ? "amber" : "emerald"} />

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <div className="relative min-w-[12rem] flex-1">
                    <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                    <Input
                      value={searchField}
                      onChange={(e) => setSearchField(e.target.value)}
                      placeholder="Filter questions…"
                      className="pl-9 !py-1.5 text-xs"
                    />
                  </div>
                  <Select
                    aria-label="Filter questions"
                    value={questionFilter}
                    onChange={(e) => setQuestionFilter(e.target.value as "all" | "unanswered" | "required")}
                    className="w-44 !py-1.5 text-xs"
                  >
                    <option value="all">All questions ({fields.length})</option>
                    <option value="unanswered">Unanswered only</option>
                    <option value="required">Required only ({fields.filter((f) => f.is_required).length})</option>
                  </Select>
                </div>
              </div>
            )}

            {/* Google Forms-Style Individual Question Cards */}
            {visibleFields.map((f) => {
              const qIdx = fields.findIndex((x) => x.id === f.id);
              const opts = f.field_type === "select" ? optionsOf(f.validation_rule) : [];
              const val = values[f.key] ?? "";
              const isPhone = f.field_type === "phone" || isPhoneLabel(f.label);
              const isAadhaar = isAadhaarLabel(f.label);
              const isPin = isPinCodeLabel(f.label);
              const liveErr = (val.trim().length > 0 || submitAttempted) ? (fieldErrors[f.key] ?? validateDynamicField(f, val)) : null;

              return (
                <div
                  key={f.id}
                  className={`card border-l-4 p-5 transition-all focus-within:shadow-md max-md:p-4 ${
                    liveErr ? "border-l-danger bg-danger-soft/15" : "border-l-transparent focus-within:border-l-brand-700"
                  }`}
                >
                  <Field
                    label={`${qIdx + 1}. ${f.label}`}
                    required={f.is_required}
                    error={liveErr ?? undefined}
                    hint={
                      !liveErr && isPhone
                        ? `${val.length}/10 digits (numbers only)`
                        : !liveErr && isAadhaar
                        ? `${val.length}/12 digits (numbers only)`
                        : !liveErr && isPin
                        ? `${val.length}/6 digits (numbers only)`
                        : undefined
                    }
                  >
                    {f.field_type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={val}
                        maxLength={500}
                        placeholder="Your answer…"
                        onChange={(e) => set(f.key, e.target.value, f)}
                        className="field mt-1.5 resize-y"
                      />
                    ) : f.field_type === "select" && opts.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {opts.length <= 6 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {opts.map((o) => {
                              const checked = val === o;
                              return (
                                <label
                                  key={o}
                                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13.5px] font-medium transition-all ${
                                    checked
                                      ? "border-brand-600 bg-brand-50/80 text-brand-900 ring-1 ring-brand-500"
                                      : "border-line bg-surface hover:border-brand-300 hover:bg-surface-2/50"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`field-${f.id}`}
                                    value={o}
                                    checked={checked}
                                    onChange={() => set(f.key, o, f)}
                                    className="h-4 w-4 border-line text-brand-700"
                                  />
                                  <span>{o}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                        <select
                          aria-label={f.label}
                          value={val}
                          onChange={(e) => set(f.key, e.target.value, f)}
                          className={`field ${opts.length <= 6 ? "sr-only" : ""}`}
                        >
                          <option value="">Select…</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ) : (
                      <input
                        type={isPhone ? "tel" : ({ number: "text", date: "date", email: "email", phone: "tel" }[f.field_type] ?? "text")}
                        inputMode={isPhone || isAadhaar || isPin || f.field_type === "number" ? "numeric" : undefined}
                        value={val}
                        maxLength={isPhone ? 10 : isAadhaar ? 12 : isPin ? 6 : 500}
                        placeholder={isPhone ? "10-digit mobile number (numbers only)" : isAadhaar ? "12-digit Aadhaar number" : isPin ? "6-digit PIN code" : "Your answer…"}
                        pattern={isPhone ? "[0-9]{10}" : isAadhaar ? "[0-9]{12}" : isPin ? "[0-9]{6}" : (f.validation_rule && f.field_type !== "select" ? f.validation_rule.replace(/^\^|\$$/g, "") : undefined)}
                        onChange={(e) => set(f.key, e.target.value, f)}
                        className="field mt-1.5"
                      />
                    )}
                  </Field>
                </div>
              );
            })}

            {fields.length === 0 && (
              <div className="card p-6 text-center text-sm text-ink-3">
                The school has not published the admission form questions for this academic year yet.
              </div>
            )}

            {/* Class Applied For Card */}
            {data.classes.length > 0 && (
              <div className="card border-l-4 border-l-transparent p-5 transition-all focus-within:border-l-brand-700 max-md:p-4">
                <Field label="Class applied for">
                  <select
                    aria-label="Class applied for"
                    value={values.class_id ?? ""}
                    onChange={(e) => set("class_id", e.target.value)}
                    className="field mt-1.5"
                  >
                    <option value="">Select…</option>
                    {data.classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.section ? ` - ${c.section}` : ""}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {/* Supporting Documents Card */}
            <div className="card space-y-3 p-5 max-md:p-4">
              <div>
                <p className="font-display text-[15px] font-bold text-ink">Supporting Documents</p>
                <p className="text-[12px] text-ink-3">Upload birth certificate, student photograph, Aadhaar or previous report card (JPEG, PNG, WebP or PDF, max 5 MB each).</p>
              </div>

              {data.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5 text-[13px] max-md:gap-2">
                  <span className="flex items-center gap-2 max-md:min-w-0 max-md:[overflow-wrap:anywhere]">
                    <Icon name="file" className="h-4 w-4 shrink-0 text-brand-700" />
                    <b>{DOC_TYPES.find((t) => t.id === d.docType)?.label ?? d.docType}</b>
                    <span className="text-ink-3">{d.fileName}</span>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost !px-2.5 !py-1 text-xs text-danger max-md:shrink-0"
                    onClick={() => removeDoc(d.id, d.fileName)}
                    aria-label={`Remove ${d.fileName}`}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  aria-label="Document type"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="field w-auto max-md:min-w-[9rem] max-md:flex-1"
                >
                  {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <label className={`btn-soft cursor-pointer max-md:flex-1 max-md:justify-center ${busy === "upload" ? "pointer-events-none opacity-50" : ""}`}>
                  <Icon name="upload" className="h-4 w-4" /> {busy === "upload" ? "Uploading…" : "Upload file"}
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
              </div>
            </div>

            {/* Submit Bar */}
            <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between max-md:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-1">
                <Button variant="soft" className="sm:flex-1" loading={busy === "draft"} onClick={() => submit(true)}>
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  className="sm:flex-[2]"
                  loading={busy === "submit"}
                  disabled={fields.length === 0}
                  onClick={() => submit(false)}
                >
                  <Icon name="check" className="h-4 w-4" /> Verify &amp; Submit Application
                </Button>
              </div>
            </div>
            {(missing.length > 0 || invalidCount > 0) && (
              <p className="px-1 text-[12px] text-ink-3">
                {missing.length > 0 && <>Still required: <b>{missing.map((f) => f.label).join(", ")}</b>. </>}
                {invalidCount > 0 && <span className="text-danger">Please fix highlighted validation errors before submitting.</span>}
              </p>
            )}
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
