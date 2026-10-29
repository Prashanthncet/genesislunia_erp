"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Field, Icon, IconButton, Input, Modal } from "@/components/ui";
import { downloadQrPng, makeQrDataUrl } from "@/lib/qr";
import { sanitizePersonName, sanitizePhone, validateEmail, validatePersonName, validatePhone } from "@/lib/validation";
import { currentAcademicYear, fmtDate, post } from "./shared";

type Row = { parent_name: string; parent_email: string; parent_contact: string };
type Generated = {
  id: string;
  parent_name: string;
  login_id: string;
  password: string;
  form_link: string;
  qr_data_url?: string | null;
  link_expires_at: string;
};

const blank = (): Row => ({ parent_name: "", parent_email: "", parent_contact: "" });

/**
 * AO: "Create admission form" for one or more parents.
 * Strictly validates every parent row before submission:
 *  - Parent Name: alphabets & spaces only (min 2 chars, no numbers).
 *  - Email: valid email format when entered.
 *  - Phone: strictly 10 digits (numbers only, no alphabets).
 */
export function CreateForms({ notify, onCreated }: { notify: (msg: string, tone?: "success" | "error") => void; onCreated: () => void }) {
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [touched, setTouched] = useState<boolean>(false);
  const [year, setYear] = useState(currentAcademicYear());
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [searchGenerated, setSearchGenerated] = useState("");
  const [qrZoom, setQrZoom] = useState<Generated | null>(null);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const rowErrors = useMemo(() => {
    return rows.map((r) => {
      const nameErr = validatePersonName(r.parent_name, true, "Parent name");
      const emailErr = validateEmail(r.parent_email, false, "Email");
      const phoneErr = validatePhone(r.parent_contact, false, "Phone number");
      const missingContact = !r.parent_email.trim() && !r.parent_contact.trim()
        ? "Provide at least a 10-digit phone number or an email address"
        : null;
      return {
        name: nameErr,
        email: emailErr,
        phone: phoneErr ?? (!r.parent_email.trim() && !r.parent_contact.trim() ? "10-digit phone or email required" : null),
        missingContact,
        valid: !nameErr && !emailErr && !phoneErr && !missingContact,
      };
    });
  }, [rows]);

  const submit = async () => {
    setTouched(true);
    if (!/^\d{4}-\d{2}$/.test(year.trim())) {
      return notify("Academic year must be in YYYY-YY format (e.g. 2026-27)", "error");
    }
    const invalidIdx = rowErrors.findIndex((e) => !e.valid);
    if (invalidIdx !== -1) {
      const err = rowErrors[invalidIdx];
      const msg = err.name || err.phone || err.email || err.missingContact || "Please fix validation errors before submitting";
      return notify(`Row #${invalidIdx + 1}: ${msg}`, "error");
    }

    const parents = rows.map((r) => ({
      parent_name: r.parent_name.trim(),
      ...(r.parent_email.trim() ? { parent_email: r.parent_email.trim() } : {}),
      ...(r.parent_contact.trim() ? { parent_contact: r.parent_contact.trim() } : {}),
    }));

    setBusy(true);
    try {
      const res = await post<{ generated: Generated[] }>("/api/admissions/trigger-links", { parents, academic_year: year.trim() });
      const withQr = res.generated.map((g) => ({
        ...g,
        qr_data_url: g.qr_data_url || makeQrDataUrl(g.form_link),
      }));
      setGenerated(withQr);
      setRows([blank()]);
      setTouched(false);
      notify(`${withQr.length} admission form${withQr.length === 1 ? "" : "s"} & QR codes verified, created, and sent`);
      onCreated();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to create forms", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, label = "Copied") => {
    void navigator.clipboard?.writeText(text).then(() => notify(label), () => notify("Copy failed", "error"));
  };

  const downloadQr = (g: Generated) => {
    downloadQrPng(
      g.form_link,
      `admission-qr-${g.login_id}-${g.parent_name.replace(/\s+/g, "-").toLowerCase()}.png`,
      g.qr_data_url,
    );
  };

  const filteredGenerated = useMemo(() => {
    const q = searchGenerated.trim().toLowerCase();
    if (!q) return generated;
    return generated.filter(
      (g) => g.parent_name.toLowerCase().includes(q) || g.login_id.toLowerCase().includes(q) || g.form_link.toLowerCase().includes(q),
    );
  }, [generated, searchGenerated]);

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden border-t-[6px] border-t-brand-700 p-5 max-md:p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[17px] font-bold text-ink">Issue Admission Form Links &amp; QR Codes</h3>
            <p className="text-[12.5px] text-ink-3">
              Each parent receives an institutional HTML email / SMS with their direct form link, scannable QR code, and Parent Portal login credentials.
            </p>
          </div>
          <Field
            label="Academic year"
            hint="Format: YYYY-YY (e.g. 2026-27)"
            error={touched && !/^\d{4}-\d{2}$/.test(year.trim()) ? "Use YYYY-YY format" : undefined}
          >
            <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-32 font-semibold" pattern="\d{4}-\d{2}" />
          </Field>
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => {
            const err = rowErrors[i];
            const showNameErr = (touched || r.parent_name.length > 0) && err?.name ? err.name : undefined;
            const showEmailErr = (touched || r.parent_email.length > 0) && err?.email ? err.email : undefined;
            const showPhoneErr = (touched || r.parent_contact.length > 0) && err?.phone ? err.phone : undefined;

            return (
              <div key={i} className="grid gap-3 rounded-xl border border-line bg-surface-2/40 p-3.5 sm:grid-cols-[1.4fr_1.4fr_1fr_auto]">
                <Field
                  label={`Parent #${i + 1} Name`}
                  required
                  error={showNameErr}
                  hint={!showNameErr ? "Alphabets only" : undefined}
                >
                  <Input
                    value={r.parent_name}
                    maxLength={120}
                    placeholder="e.g. Rajesh Sharma"
                    onChange={(e) => set(i, { parent_name: sanitizePersonName(e.target.value) })}
                  />
                </Field>
                <Field
                  label="Email (receives HTML invite)"
                  error={showEmailErr}
                  hint={!showEmailErr ? "Valid email address" : undefined}
                >
                  <Input
                    type="email"
                    value={r.parent_email}
                    maxLength={160}
                    placeholder="parent@example.com"
                    onChange={(e) => set(i, { parent_email: e.target.value })}
                  />
                </Field>
                <Field
                  label="Phone (10 digits only)"
                  error={showPhoneErr}
                  hint={!showPhoneErr ? `${r.parent_contact.length}/10 digits (numbers only)` : undefined}
                >
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={r.parent_contact}
                    maxLength={10}
                    pattern="[0-9]{10}"
                    placeholder="9876543210"
                    onChange={(e) => set(i, { parent_contact: sanitizePhone(e.target.value) })}
                  />
                </Field>
                <div className="flex items-end pb-1 max-md:justify-end max-md:pb-0 max-md:empty:hidden">
                  {rows.length > 1 && <IconButton name="trash" label="Remove row" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 max-md:[&>*]:flex-1">
          <Button variant="soft" onClick={() => setRows([...rows, blank()])} disabled={rows.length >= 50}>
            <Icon name="plus" className="h-4 w-4" /> Add another parent
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            <Icon name="qr" className="h-4 w-4" /> Verify, create forms &amp; send links
          </Button>
        </div>
      </div>

      {generated.length > 0 && (
        <div className="card border-l-4 border-l-warn p-5 max-md:p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
              <div>
                <p className="text-[13.5px] font-bold text-ink">
                  Generated Admission Forms, Portal Credentials &amp; QR Codes ({generated.length})
                </p>
                <p className="text-[12.5px] text-ink-2">
                  <b>Hand these credentials or QR codes to the parents now.</b> Temporary passwords are shown only once; parents can fill the form either via the QR/link or by signing into the Parent Portal.
                </p>
              </div>
            </div>
            {generated.length > 1 && (
              <div className="relative w-64 max-md:w-full">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <Input
                  value={searchGenerated}
                  onChange={(e) => setSearchGenerated(e.target.value)}
                  placeholder="Filter generated forms…"
                  className="pl-9"
                />
              </div>
            )}
          </div>

          <div className="grid gap-3.5 md:grid-cols-2">
            {filteredGenerated.map((g) => {
              const qrSrc = g.qr_data_url || makeQrDataUrl(g.form_link);
              return (
                <div key={g.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-[15px] font-bold text-ink">{g.parent_name}</p>
                      <Badge tone="amber">Valid till {fmtDate(g.link_expires_at)}</Badge>
                    </div>
                    <div className="rounded-xl bg-surface-2 px-3 py-2 text-xs">
                      <p className="flex items-center justify-between gap-2">
                        <span className="text-ink-3">Portal Login ID:</span>
                        <code className="font-mono font-bold text-ink">{g.login_id}</code>
                      </p>
                      <p className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-ink-3">One-Time Password:</span>
                        <code className="font-mono font-bold text-brand-700">{g.password}</code>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <a href={g.form_link} target="_blank" rel="noreferrer" className="btn-soft !px-2.5 !py-1 text-xs">
                        Open Form <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
                      </a>
                      <Button size="sm" variant="soft" onClick={() => copy(g.form_link, "Form link copied")}>
                        <Icon name="copy" className="h-3.5 w-3.5" /> Copy Link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copy(`Login ID: ${g.login_id} | Password: ${g.password} | Form: ${g.form_link}`, "Credentials copied")}>
                        <Icon name="clipboard" className="h-3.5 w-3.5" /> Copy All
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => downloadQr(g)}>
                        <Icon name="download" className="h-3.5 w-3.5" /> QR PNG
                      </Button>
                    </div>
                  </div>

                  {qrSrc && (
                    <button
                      type="button"
                      onClick={() => setQrZoom({ ...g, qr_data_url: qrSrc })}
                      className="group flex flex-col items-center rounded-xl border border-line bg-white p-2 shadow-2xs transition-transform hover:scale-105"
                      title="Click to enlarge QR code"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrSrc} alt={`QR code for ${g.parent_name}`} className="h-24 w-24 rounded" />
                      <span className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-700">
                        <Icon name="qr" className="h-3 w-3" /> Scan Form
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <Button variant="ghost" className="mt-4 max-md:w-full" onClick={() => setGenerated([])}>
            I have handed these over — hide credentials
          </Button>
        </div>
      )}

      {qrZoom && (
        <Modal open onClose={() => setQrZoom(null)} title={`Admission Form QR — ${qrZoom.parent_name}`} size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setQrZoom(null)}>Close</Button>
              <Button variant="soft" onClick={() => copy(qrZoom.form_link, "Form link copied")}>
                <Icon name="copy" className="h-4 w-4" /> Copy Link
              </Button>
              <Button variant="primary" onClick={() => downloadQr(qrZoom)}>
                <Icon name="download" className="h-4 w-4" /> Download QR PNG
              </Button>
            </>
          }>
          <div className="flex flex-col items-center space-y-3 py-2 text-center">
            {(qrZoom.qr_data_url || makeQrDataUrl(qrZoom.form_link)) && (
              <div className="rounded-2xl border-2 border-brand-100 bg-white p-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrZoom.qr_data_url || makeQrDataUrl(qrZoom.form_link)} alt={`QR for ${qrZoom.parent_name}`} className="h-56 w-56" />
              </div>
            )}
            <p className="text-xs text-ink-2">
              Scan with any phone camera to open the admission form directly, or sign in to the Parent Portal with Login ID <b className="font-mono">{qrZoom.login_id}</b>.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
