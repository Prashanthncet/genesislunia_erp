"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BASE, apiDownload, apiFetch } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth";
import { inr } from "@/lib/format";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Modal, PageHeader, ProgressBar, Select, Skeleton, Tabs, useToast } from "@/components/ui";
import { PanelState, fmtDay } from "@/components/portal/bits";
import { confirmAction } from "@/components/confirm";
import { currentAcademicYear, fmtDate, readUpload } from "@/components/admissions/shared";
import {
  sanitizeDynamicValue,
  validateDynamicField,
  validateAllDynamicFields,
  isPhoneLabel,
  isAadhaarLabel,
  isPinCodeLabel,
} from "@/lib/validation";
import { makeQrDataUrl, downloadQrPng } from "@/lib/qr";

type Application = {
  id: string;
  student_name: string | null;
  status: string;
  class: { id: string; name: string; section: string | null } | null;
  roll_no: string | null;
  house: string | null;
  payment_status: string;
  fee_amount: number | null;
  receipt_no: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  academic_year: string | null;
  student_id: string | null;
  remarks: string | null;
  created_at: string;
  confirmed: boolean;
  editable?: boolean;
  can_pay?: boolean;
  token?: string | null;
  form_link?: string | null;
  qr_data_url?: string | null;
  link_expires_at?: string | null;
  timeline: { id: string; from_status: string | null; to_status: string; action: string; actor_role: string | null; remarks: string | null; at: string }[];
};

type PublicField = { id: string; key: string; label: string; field_type: string; is_required: boolean; validation_rule: string | null };
type Doc = { id: string; docType: string; fileName: string; sizeBytes: number };
type PublicFormPayload = {
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
  form_link?: string | null;
  qr_data_url?: string | null;
  fields: PublicField[];
  classes: { id: string; name: string; section: string | null }[];
  dynamic_data: Record<string, string>;
  documents: Doc[];
  payment: { can_pay: boolean; amount: number | null; status: string };
};

const DOC_TYPES = [
  { id: "birth_certificate", label: "Birth certificate" },
  { id: "photo", label: "Student photograph" },
  { id: "aadhar", label: "Aadhaar / ID proof" },
  { id: "report_card", label: "Previous report card" },
  { id: "transfer_certificate", label: "Transfer certificate" },
  { id: "other", label: "Other document" },
];

const STEPS = [
  "Links Sent",
  "Submitted by Parent",
  "Document Validated",
  "Payment Received",
  "Fee Approved",
  "Roll No Assigned",
  "VP Approved",
  "Admission Complete",
];

const STEP_LABEL: Record<string, string> = {
  "Links Sent": "Form link sent",
  "Submitted by Parent": "Form submitted",
  "Document Validated": "Documents checked",
  "Payment Received": "Fee paid",
  "Fee Approved": "Fee verified",
  "Roll No Assigned": "Roll no. & house",
  "VP Approved": "Vice Principal approved",
  "Admission Complete": "Admission confirmed",
};

function stepIndex(status: string): number {
  if (status === "Admission Confirmed") return STEPS.length - 1;
  if (status === "Re-submit") return 1;
  return STEPS.indexOf(status);
}

function optionsOf(rule: string | null): string[] {
  if (!rule) return [];
  const inner = rule.replace(/^\^\(?|\)?\$$/g, "");
  return inner.includes("|") ? inner.split("|").map((s) => s.replace(/\\\+/g, "+").trim()).filter(Boolean) : [];
}

async function pub<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/admissions/public${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = body?.message;
    throw new Error(Array.isArray(m) ? m.join(" · ") : (m || `Request failed (${res.status})`));
  }
  return body as T;
}

/**
 * Embedded Google Forms-style form filler right inside the Parent Portal (/portal/admission).
 * Parents can fill all questions, upload documents, save draft, submit, and pay online without leaving the portal.
 */
function PortalGoogleFormFiller({
  token,
  onSaved,
  notify,
}: {
  token: string;
  onSaved: () => void;
  notify: (msg: string, tone?: "success" | "error") => void;
}) {
  const [data, setData] = useState<PublicFormPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [docType, setDocType] = useState("birth_certificate");
  const [busy, setBusy] = useState<string | null>(null);
  const [questionFilter, setQuestionFilter] = useState<"all" | "unanswered" | "required">("all");
  const [searchField, setSearchField] = useState("");

  const loadForm = useCallback(async () => {
    setLoading(true);
    try {
      const d = await pub<PublicFormPayload>(`/${encodeURIComponent(token)}`);
      setData(d);
      setValues((prev) => (Object.keys(prev).length ? prev : d.dynamic_data));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not load form", "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => { void loadForm(); }, [loadForm]);

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
      await loadForm();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const removeDoc = async (docId: string, fileName?: string) => {
    const ok = await confirmAction({
      title: `Remove ${fileName ?? "this document"}?`,
      confirmText: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await pub(`/${encodeURIComponent(token)}/documents/${docId}`, { method: "DELETE" });
      notify("Document removed");
      await loadForm();
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
        text: "All fields have been verified. Your form answers and uploaded documents will be sent to the school admission office.",
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
      await loadForm();
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Submission failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const payAdmissionFee = async () => {
    setBusy("pay");
    try {
      const order = await pub<{ gateway_order_id: string; gateway: string; amount: number }>(`/${encodeURIComponent(token)}/pay`, { method: "POST" });
      if (order.gateway === "mock") {
        await fetch(`${BASE}/api/payments/webhook/mock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gateway_order_id: order.gateway_order_id, payment_id: `pay_${Date.now()}`, status: "paid" }),
        });
        notify("Admission fee paid! The school accounts desk will verify your receipt.");
        await loadForm();
        onSaved();
      } else {
        notify(`Payment order ${order.gateway_order_id} created.`);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Payment failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="card space-y-3 p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const fields = data.fields ?? [];
  const filled = fields.filter((f) => (values[f.key] ?? "").trim().length > 0).length;
  const missing = fields.filter((f) => f.is_required && !(values[f.key] ?? "").trim());
  const validationErrorsMap = validateAllDynamicFields(fields, values);
  const invalidCount = Object.keys(validationErrorsMap).length;

  const formUrl =
    data.form_link ||
    (typeof window !== "undefined" ? `${window.location.origin}/admission-form?token=${encodeURIComponent(token)}` : "");
  const qrSrc = data.qr_data_url || (formUrl ? makeQrDataUrl(formUrl, 240) : "");

  const visibleFields = fields.filter((f) => {
    const q = searchField.trim().toLowerCase();
    if (q && !f.label.toLowerCase().includes(q)) return false;
    if (questionFilter === "unanswered" && (values[f.key] ?? "").trim().length > 0) return false;
    if (questionFilter === "required" && !f.is_required) return false;
    return true;
  });

  if (!data.editable && data.payment.can_pay) {
    return (
      <div className="card border-t-[8px] border-t-brand-700 p-6">
        <h3 className="font-display text-lg font-bold text-ink">Documents Verified — Pay Admission Fee</h3>
        <p className="mt-1 text-sm text-ink-2">
          Your documents have been verified by the admission office. Please pay the admission fee of <b>{inr(data.payment.amount)}</b> to proceed to Roll Number &amp; House allotment.
        </p>
        <Button variant="primary" className="mt-4" loading={busy === "pay"} onClick={payAdmissionFee}>
          <Icon name="wallet" className="h-4 w-4" /> Pay {inr(data.payment.amount)} Online Now
        </Button>
      </div>
    );
  }

  if (!data.editable) {
    return (
      <div className="card p-5 text-sm text-ink-2">
        This form has already been submitted and is currently in status <b>{data.status}</b>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Google Forms-style Banner Card */}
      <div className="card overflow-hidden border-t-[8px] border-t-brand-700 p-5 shadow-sm max-md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700">
              <Icon name="admissions" className="h-3.5 w-3.5" /> Portal Admission Form — {data.academic_year}
            </span>
            <h3 className="font-display text-[20px] font-extrabold text-ink">
              {data.school ?? "School"} Admission Application
            </h3>
            <p className="text-[12.5px] text-ink-3">
              Fill out all required questions (<span className="font-bold text-danger">*</span>) and upload your child&apos;s supporting documents right here in the portal.
            </p>
          </div>
          {qrSrc && (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="Form QR" className="h-16 w-16 rounded-lg border border-line bg-white p-1" />
              <div className="space-y-1 text-xs">
                <p className="font-bold text-ink">Form QR Code</p>
                <p className="text-[11px] text-ink-3">Scan to open on phone</p>
                <button
                  type="button"
                  onClick={() => downloadQrPng(formUrl, `admission-qr-${data.academic_year}.png`)}
                  className="text-[11px] font-bold text-brand-700 underline"
                >
                  Download QR
                </button>
              </div>
            </div>
          )}
        </div>

        {data.status === "Re-submit" && (
          <div className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-2.5 text-[13px] text-warn-ink">
            <b>Corrections requested by Admission Office:</b> {data.remarks ?? "Please review and resubmit."}
          </div>
        )}

        {fields.length > 0 && (
          <div className="mt-4 space-y-2.5 border-t border-line pt-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
              <span>{filled} of {fields.length} questions answered</span>
              {missing.length > 0 ? (
                <span className="text-warn">{missing.length} required left</span>
              ) : invalidCount > 0 ? (
                <span className="text-danger">{invalidCount} validation error{invalidCount === 1 ? "" : "s"}</span>
              ) : (
                <span className="text-ok-ink">Verified &amp; ready to submit ✓</span>
              )}
            </div>
            <ProgressBar value={(filled / fields.length) * 100} tone={missing.length || invalidCount ? "amber" : "emerald"} />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="relative min-w-[12rem] flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                <Input
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                  placeholder="Filter form questions…"
                  className="pl-8 !py-1.5 text-xs"
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
                <option value="required">Required only</option>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Google Forms-style Question Cards */}
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
                              name={`portal-field-${f.id}`}
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
                  ) : (
                    <select
                      aria-label={f.label}
                      value={val}
                      onChange={(e) => set(f.key, e.target.value, f)}
                      className="field"
                    >
                      <option value="">Select…</option>
                      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
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

      {/* Documents Card */}
      <div className="card space-y-3 p-5 max-md:p-4">
        <div>
          <p className="font-display text-[15px] font-bold text-ink">Supporting Documents</p>
          <p className="text-[12px] text-ink-3">JPEG, PNG, WebP or PDF, up to 5 MB each.</p>
        </div>
        {data.documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-xl border border-line bg-surface-2/40 px-3.5 py-2 text-[13px] max-md:gap-2">
            <span className="max-md:min-w-0 max-md:[overflow-wrap:anywhere]">
              <b>{DOC_TYPES.find((t) => t.id === d.docType)?.label ?? d.docType}</b>{" "}
              <span className="text-ink-3">{d.fileName}</span>
            </span>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs text-danger max-md:shrink-0"
              onClick={() => removeDoc(d.id, d.fileName)}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Save / Submit Bar */}
      <div className="card flex flex-col gap-2 p-5 sm:flex-row max-md:p-4">
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
          <Icon name="check" className="h-4 w-4" /> Verify &amp; Submit Admission Form
        </Button>
      </div>
      {(missing.length > 0 || invalidCount > 0) && (
        <p className="text-[12px] text-ink-3">
          {missing.length > 0 && <>Still required: <b>{missing.map((f) => f.label).join(", ")}</b>. </>}
          {invalidCount > 0 && <span className="text-danger">Please fix highlighted validation errors before submitting.</span>}
        </p>
      )}
    </div>
  );
}

function Confirmed({ app, onDownloadLetter }: { app: Application; onDownloadLetter: (id: string, rollNo: string | null) => void }) {
  return (
    <section className="overflow-hidden rounded-panel border border-ok-line bg-surface shadow-card">
      <div className="flex flex-col items-center gap-3 bg-ok-soft px-5 py-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ok text-white shadow-lift">
          <Icon name="check" className="h-8 w-8" />
        </span>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ok-ink">Admission confirmed</p>
        <h2 className="font-display text-[24px] font-extrabold leading-tight text-ink">
          Welcome to the school{app.student_name ? `, ${app.student_name}` : ""}!
        </h2>
        <p className="max-w-md text-[13px] text-ink-2">
          Every step of the admission is complete. You can download your official Admission Letter below.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <div><dt className="label">Class</dt><dd className="text-[14px] font-semibold text-ink">{app.class ? `${app.class.name}${app.class.section ? ` ${app.class.section}` : ""}` : "—"}</dd></div>
        <div><dt className="label">Roll number</dt><dd className="text-[14px] font-semibold tnum text-ink">{app.roll_no ?? "—"}</dd></div>
        <div><dt className="label">House</dt><dd className="text-[14px] font-semibold text-ink">{app.house ?? "—"}</dd></div>
        <div className="min-w-0"><dt className="label">Fee receipt</dt><dd className="text-[14px] font-semibold text-ink max-md:break-all">{app.receipt_no ?? "—"}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
        <Link href="/portal" className="btn-primary max-md:w-full max-md:justify-center">
          <Icon name="home" className="h-4 w-4" />
          Go to my child&apos;s dashboard
        </Link>
        {app.status === "Admission Complete" && (
          <Button variant="soft" onClick={() => onDownloadLetter(app.id, app.roll_no)}>
            <Icon name="download" className="h-4 w-4" /> Download Admission Letter PDF
          </Button>
        )}
      </div>
    </section>
  );
}

function ApplicationCard({
  app,
  onFillInPortal,
  onShowQr,
}: {
  app: Application;
  onFillInPortal: (token: string) => void;
  onShowQr: (app: Application) => void;
}) {
  const idx = stepIndex(app.status);
  return (
    <Card>
      <CardHead
        icon="admissions"
        title={app.student_name ?? "Admission application"}
        subtitle={[app.academic_year, `applied ${fmtDay(app.created_at)}`, app.link_expires_at ? `valid till ${fmtDate(app.link_expires_at)}` : null].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={app.confirmed ? "emerald" : app.status === "Re-submit" ? "rose" : "amber"}>{app.status}</Badge>
            <Button size="sm" variant="soft" onClick={() => onShowQr(app)}>
              <Icon name="qr" className="h-3.5 w-3.5" /> Form QR
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void apiDownload(`/api/admissions/${app.id}/summary.pdf`, `admission-summary-${app.id.slice(0, 8)}.pdf`);
              }}
            >
              <Icon name="download" className="h-3.5 w-3.5" /> Summary PDF
            </Button>
            {(app.editable || app.can_pay) && app.token && (
              <Button size="sm" variant="primary" onClick={() => onFillInPortal(app.token!)}>
                <Icon name="edit" className="h-3.5 w-3.5" />
                {app.can_pay ? "Pay Admission Fee" : app.status === "Re-submit" ? "Fix & Re-submit Form" : "Fill Form in Portal"}
              </Button>
            )}
          </div>
        }
      />
      {app.status === "Re-submit" && (
        <p className="mx-4 mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger-ink sm:mx-5">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          The school asked you to correct and re-submit the form{app.remarks ? `: ${app.remarks}` : "."} Click &ldquo;Fix &amp; Re-submit Form&rdquo; above to edit right here in the portal.
        </p>
      )}
      <ol className="space-y-0 p-4 sm:p-5" aria-label="Admission progress">
        {STEPS.map((s, i) => {
          const done = i < idx || (i === idx && app.confirmed);
          const current = i === idx && !app.confirmed;
          const event = [...app.timeline].reverse().find((t) => t.to_status === s);
          return (
            <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
              {i < STEPS.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${done ? "bg-ok" : "bg-line"}`} aria-hidden />}
              <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                done ? "bg-ok text-white" : current ? "bg-brand-700 text-white ring-4 ring-brand-100" : "bg-surface-2 text-ink-3 ring-1 ring-line"
              }`}>
                {done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`text-[13px] font-semibold ${done || current ? "text-ink" : "text-ink-3"}`}>
                  {STEP_LABEL[s]}
                  {current && <span className="ml-2 text-[11px] font-medium text-brand-600">in progress</span>}
                </p>
                {event && (
                  <p className="text-[11.5px] text-ink-3">
                    {fmtDay(event.at)}{event.actor_role ? ` · ${ROLE_LABEL[event.actor_role] ?? event.actor_role}` : ""}
                    {event.remarks ? ` · ${event.remarks}` : ""}
                  </p>
                )}
                {s === "Payment Received" && app.fee_amount != null && (
                  <p className="text-[11.5px] text-ink-3">Admission fee {inr(app.fee_amount)} · {app.payment_status}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default function PortalAdmissionPage() {
  const { push: notify } = useToast();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"status" | "fill">("status");
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const [qrModalApp, setQrModalApp] = useState<Application | null>(null);

  // Filter options for portal applications
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(() => {
    setError(null);
    apiFetch<Application[]>("/api/portal/admission")
      .then((res) => {
        setApps(res);
        const editableApp = res.find((a) => (a.editable || a.can_pay) && a.token);
        if (editableApp?.token) {
          setActiveToken((prev) => prev ?? editableApp.token!);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your application"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNewApplication = async () => {
    setStartingNew(true);
    try {
      const created = await apiFetch<{ id: string; token: string }>("/api/portal/admission/start", {
        method: "POST",
        body: JSON.stringify({ academic_year: currentAcademicYear() }),
      });
      notify("Admission form ready — fill your details below");
      setActiveToken(created.token);
      setActiveTab("fill");
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not start admission form", "error");
    } finally {
      setStartingNew(false);
    }
  };

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    const q = searchQuery.trim().toLowerCase();
    return apps.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !(a.student_name ?? "").toLowerCase().includes(q) && !(a.academic_year ?? "").toLowerCase().includes(q) && !a.status.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [apps, statusFilter, searchQuery]);

  const confirmed = apps?.find((a) => a.confirmed);
  const editableApps = (apps ?? []).filter((a) => (a.editable || a.can_pay) && a.token);

  const downloadLetter = (id: string, rollNo: string | null) => {
    apiDownload(`/api/admissions/${id}/letter.pdf`, `admission-letter-${rollNo ?? id.slice(0, 8)}.pdf`).catch((e) =>
      notify(e instanceof Error ? e.message : "Could not download letter", "error"),
    );
  };

  const modalQrUrl = useMemo(() => {
    if (!qrModalApp) return "";
    return (
      qrModalApp.form_link ||
      (qrModalApp.token && typeof window !== "undefined" ? `${window.location.origin}/admission-form?token=${qrModalApp.token}` : "") ||
      (typeof window !== "undefined" ? `${window.location.origin}/portal/admission` : "")
    );
  }, [qrModalApp]);

  const modalQrSrc = useMemo(() => {
    if (!qrModalApp) return "";
    return qrModalApp.qr_data_url || (modalQrUrl ? makeQrDataUrl(modalQrUrl, 240) : "");
  }, [qrModalApp, modalQrUrl]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon="admissions"
        title="Admissions & Application Form"
        subtitle="Fill and submit your child's admission form directly in the portal, scan the QR code, or track approval steps."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {editableApps.length > 0 ? (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveToken(editableApps[0].token!);
                  setActiveTab("fill");
                }}
              >
                <Icon name="edit" className="h-4 w-4" /> Fill Admission Form Now
              </Button>
            ) : (
              <Button variant="primary" loading={startingNew} onClick={startNewApplication}>
                <Icon name="plus" className="h-4 w-4" /> Start Admission Form ({currentAcademicYear()})
              </Button>
            )}
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "status", label: "Application Status & QR", icon: "admissions", count: apps?.length ?? 0 },
          { id: "fill", label: "Fill Admission Form", icon: "edit", count: editableApps.length || undefined },
        ]}
      />

      {error && (
        <Card>
          <PanelState loading={false} error={error} reload={load} />
        </Card>
      )}
      {!apps && !error && <PanelState loading error={null} />}

      {activeTab === "fill" && (
        <div className="space-y-4">
          {editableApps.length > 1 && (
            <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="text-xs font-bold text-ink-2">Select application to fill:</span>
              <Select
                aria-label="Select application"
                value={activeToken ?? ""}
                onChange={(e) => setActiveToken(e.target.value)}
                className="w-64"
              >
                {editableApps.map((a) => (
                  <option key={a.id} value={a.token ?? ""}>
                    {a.student_name ?? "New Application"} ({a.academic_year}) — {a.status}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {activeToken ? (
            <PortalGoogleFormFiller
              token={activeToken}
              notify={notify}
              onSaved={() => {
                load();
                setActiveTab("status");
              }}
            />
          ) : (
            <Card>
              <EmptyState
                icon="admissions"
                title="No editable admission form open yet"
                hint="Start a new admission application for the current academic year to fill questions and upload documents right here."
                action={
                  <Button variant="primary" loading={startingNew} onClick={startNewApplication}>
                    <Icon name="plus" className="h-4 w-4" /> Start Admission Form ({currentAcademicYear()})
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      )}

      {activeTab === "status" && apps && (
        <div className="space-y-4">
          {apps.length > 0 && (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="relative min-w-[14rem] flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by child name, academic year, or status…"
                  className="pl-9"
                />
              </div>
              <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-52">
                <option value="all">All statuses ({apps.length})</option>
                {STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="Re-submit">Re-submit</option>
              </Select>
            </div>
          )}

          {apps.length === 0 && (
            <Card>
              <EmptyState
                icon="admissions"
                title="No admission application on this login yet"
                hint="You can start and fill a new admission application right inside the Parent Portal or use the link sent by the school."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="primary" loading={startingNew} onClick={startNewApplication}>
                      <Icon name="plus" className="h-4 w-4" /> Fill Admission Form in Portal
                    </Button>
                    <Link href="/portal" className="btn-soft">Back to dashboard</Link>
                  </div>
                }
              />
            </Card>
          )}

          {confirmed && <Confirmed app={confirmed} onDownloadLetter={downloadLetter} />}

          {filteredApps.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              onFillInPortal={(tok) => {
                setActiveToken(tok);
                setActiveTab("fill");
              }}
              onShowQr={(item) => setQrModalApp(item)}
            />
          ))}
        </div>
      )}

      {qrModalApp && (
        <Modal
          open
          onClose={() => setQrModalApp(null)}
          title={`Admission Form QR — ${qrModalApp.student_name ?? qrModalApp.academic_year ?? "Application"}`}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setQrModalApp(null)}>Close</Button>
              {modalQrUrl && (
                <Button
                  variant="soft"
                  onClick={() => void navigator.clipboard?.writeText(modalQrUrl).then(() => notify("Form link copied"))}
                >
                  <Icon name="copy" className="h-4 w-4" /> Copy Link
                </Button>
              )}
              {modalQrUrl && (
                <Button
                  variant="primary"
                  onClick={() => downloadQrPng(modalQrUrl, `admission-qr-${qrModalApp.id.slice(0, 8)}.png`)}
                >
                  <Icon name="download" className="h-4 w-4" /> Download QR
                </Button>
              )}
            </>
          }
        >
          <div className="flex flex-col items-center space-y-3 py-2 text-center">
            {modalQrSrc && (
              <div className="rounded-2xl border-2 border-brand-100 bg-white p-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={modalQrSrc} alt="Admission Form QR" className="h-56 w-56" />
              </div>
            )}
            <p className="text-xs text-ink-2">
              Scan this QR code with your phone camera to open the admission form directly, or click <b>Fill Admission Form</b> in the portal.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
