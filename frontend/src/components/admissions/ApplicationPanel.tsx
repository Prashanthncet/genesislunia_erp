"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { R, hasRole, useMe } from "@/lib/auth";
import { Badge, Button, Field, Icon, Input, Modal, ProgressBar, Select, Skeleton, Tabs, Textarea } from "@/components/ui";
import { Application, DocLink, PIPELINE, STATUS_TONE, docHref, fmtDate, fmtDateTime, inr, post, readUpload, stageOf } from "./shared";

type Detail = Application & {
  dynamic_data: Record<string, string>;
  template: { id: string; key: string; label: string }[];
  form_link: string | null;
};
type Doc = { id: string; docType: string; fileName: string; sizeBytes: number; studentId: string | null; createdAt: string };
type Step = { id: string; fromStatus: string | null; toStatus: string; action: string; actorRole: string | null; remarks: string | null; createdAt: string };
type Notif = { id: string; channel: string; recipient: string; subject: string | null; body: string; status: string; createdAt: string };
type ClassRow = { id: string; name: string; section: string | null };

type Dialog = null | "resubmit" | "offline" | "verify" | "vp-back" | "sign" | "p-back" | "reject";

/**
 * Application drawer: form data, documents, step timeline, notification history, and the
 * ONE action the viewer's role may take at the current status. The backend re-checks all of it.
 */
export function ApplicationPanel({
  id, onClose, onChanged, notify,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  notify: (msg: string, tone?: "success" | "error") => void;
}) {
  const { me } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tl, setTl] = useState<{ steps: Step[]; notifications: Notif[] }>({ steps: [], notifications: [] });
  const [tab, setTab] = useState<"form" | "docs" | "timeline" | "messages">("form");
  const [preview, setPreview] = useState<{ name: string; url: string; mime: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [text, setText] = useState("");
  const [ref, setRef] = useState({ reference_no: "", payment_mode: "Cash", receipt_no: "" });
  const [receiptFile, setReceiptFile] = useState<{ file_name: string; data_url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, dl, t] = await Promise.all([
        apiFetch<Detail>(`/api/admissions/${id}`),
        apiFetch<Doc[]>(`/api/admissions/${id}/documents`),
        apiFetch<{ steps: Step[]; notifications: Notif[] }>(`/api/admissions/${id}/timeline`),
      ]);
      setD(detail);
      setDocs(dl);
      setTl(t);
      setClassId(detail.classId ?? "");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load application", "error");
    }
  }, [id, notify]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (d?.status === "Fee Approved" && hasRole(me, R.ADMISSION_OS) && !classes.length) {
      apiFetch<ClassRow[] | { data: ClassRow[] }>("/api/classes")
        .then((c) => setClasses(Array.isArray(c) ? c : c.data ?? []))
        .catch(() => setClasses([]));
    }
  }, [d?.status, me, classes.length]);

  const act = async (path: string, body: object, ok: string) => {
    setBusy(true);
    try {
      await post(`/api/admissions/${id}/${path}`, body);
      notify(ok);
      setDialog(null);
      setText("");
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const view = async (doc: Doc) => {
    try {
      // Short-lived signed URL (data_url only for documents not yet moved into storage).
      const r = await apiFetch<DocLink>(`/api/admissions/documents/${doc.id}/download`);
      const url = docHref(r);
      if (!url) throw new Error("Document content is unavailable");
      const mime = r.mime_type ?? (/^data:([^;]+);/.exec(url)?.[1] ?? "");
      setPreview({ name: r.file_name, url, mime });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not open document", "error");
    }
  };

  const download = (path: string, name: string) =>
    apiDownload(path, name).catch((e) => notify(e instanceof Error ? e.message : "Download failed", "error"));

  if (!d) {
    return (
      <Modal open onClose={onClose} title="Application" size="lg">
        <div className="space-y-3"><Skeleton className="h-5 w-60" /><Skeleton className="h-24 w-full" /></div>
      </Modal>
    );
  }

  const s = d.status;
  const can = (roles: readonly string[]) => hasRole(me, roles);
  const VP_OR_P = [...R.ADMISSION_VP, ...R.ADMISSION_PRINCIPAL];
  const terminal = s === "Admission Complete" || s === "Rejected";

  const actions = (
    <>
      {s === "Submitted by Parent" && can(R.ADMISSION_SETUP) && (
        <>
          <Button variant="soft" onClick={() => setDialog("resubmit")}>Send for re-submit</Button>
          <Button variant="primary" loading={busy} onClick={() => act("validate", { is_valid: true }, "Documents validated — parent can now pay")}>
            <Icon name="check" className="h-4 w-4" /> Documents valid
          </Button>
        </>
      )}
      {s === "Link Expired" && can(R.ADMISSION_SETUP) && (
        <Button variant="primary" loading={busy} onClick={() => act("reissue-link", {}, "New link sent to the parent")}>Re-issue link</Button>
      )}
      {s === "Document Validated" && can(R.ADMISSION_ACCOUNTS) && (
        <Button variant="soft" onClick={() => setDialog("offline")}><Icon name="wallet" className="h-4 w-4" /> Record offline payment</Button>
      )}
      {s === "Payment Received" && can(R.ADMISSION_ACCOUNTS) && (
        <Button variant="primary" onClick={() => setDialog("verify")}><Icon name="receipt" className="h-4 w-4" /> Verify &amp; approve fee</Button>
      )}
      {s === "Fee Approved" && can(R.ADMISSION_OS) && (
        <span className="flex flex-wrap items-center gap-2">
          <Select aria-label="Class for roll number" value={classId} onChange={(e) => setClassId(e.target.value)} className="w-auto">
            <option value="">{d.class ? `${d.class.name}${d.class.section ? `-${d.class.section}` : ""} (applied)` : "Class…"}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? `-${c.section}` : ""}</option>)}
          </Select>
          <Button variant="primary" loading={busy} onClick={() => act("allocate", classId ? { class_id: classId } : {}, "Roll number and house assigned")}>
            <Icon name="key" className="h-4 w-4" /> Assign roll &amp; house
          </Button>
        </span>
      )}
      {s === "Roll No Assigned" && can(R.ADMISSION_VP) && (
        <>
          <Button variant="soft" onClick={() => setDialog("vp-back")}>Send back to OS</Button>
          <Button variant="primary" loading={busy} onClick={() => act("vp-approve", {}, "Approved — sent to the Principal")}>
            <Icon name="check" className="h-4 w-4" /> VP approve
          </Button>
        </>
      )}
      {s === "VP Approved" && can(R.ADMISSION_PRINCIPAL) && (
        <>
          <Button variant="soft" onClick={() => setDialog("p-back")}>Send back to VP</Button>
          <Button variant="primary" onClick={() => { setText(me?.name ?? ""); setDialog("sign"); }}>
            <Icon name="edit" className="h-4 w-4" /> Sign &amp; confirm
          </Button>
        </>
      )}
      {!terminal && can(VP_OR_P) && (
        <Button variant="danger" onClick={() => setDialog("reject")}>Reject</Button>
      )}
      {(s === "Admission Confirmed" || s === "Admission Complete") && (
        <Button variant="soft" onClick={() => download(`/api/admissions/${id}/letter.pdf`, `admission-letter-${d.rollNo ?? id}.pdf`)}>
          <Icon name="download" className="h-4 w-4" /> Admission letter
        </Button>
      )}
    </>
  );

  const remarksDialog = (title: string, path: string, ok: string, label = "Remarks") => (
    <Modal open onClose={() => setDialog(null)} title={title} size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
        <Button variant={dialog === "reject" ? "danger" : "primary"} loading={busy} disabled={!text.trim()}
          onClick={() => act(path, path === "validate" ? { is_valid: false, remarks: text.trim() } : { remarks: text.trim() }, ok)}>Confirm</Button>
      </>}>
      <Field label={label} required><Textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} /></Field>
    </Modal>
  );

  return (
    <Modal open onClose={onClose} size="lg"
      title={d.studentName ?? d.parentName ?? "Application"}
      subtitle={`${d.academicYear ?? ""} · Parent ${d.parentName ?? "—"} · Login ${d.loginId ?? "—"}`}
      footer={actions}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[s] ?? "sky"}>{s}</Badge>
          {d.rollNo && <Badge tone="violet">Roll {d.rollNo}</Badge>}
          {d.house && <Badge tone="teal">{d.house} house</Badge>}
          <Badge tone={d.paymentStatus === "Verified" ? "emerald" : d.paymentStatus === "Paid" ? "teal" : "amber"}>Fee {d.paymentStatus}</Badge>
          {d.form_link && (s === "Links Sent" || s === "Re-submit") && (
            <a href={d.form_link} target="_blank" rel="noreferrer" className="btn-soft !px-2.5 !py-1 text-xs">Parent form <Icon name="arrowUpRight" className="h-3.5 w-3.5" /></a>
          )}
        </div>
        <ProgressBar value={((stageOf(s) + 1) / PIPELINE.length) * 100} tone={s === "Rejected" ? "rose" : s === "Admission Complete" ? "emerald" : "brand"}
          label={`Step ${stageOf(s) + 1} of ${PIPELINE.length}`} />
        {d.remarks && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2"><b>Latest remarks:</b> {d.remarks}</p>}

        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "form" as const, label: "Form" },
          { id: "docs" as const, label: "Documents", count: docs.length },
          { id: "timeline" as const, label: "Timeline", count: tl.steps.length },
          { id: "messages" as const, label: "Notifications", count: tl.notifications.length },
        ]} />

        {tab === "form" && (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {d.template.map((f) => (
              <div key={f.id}>
                <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{f.label}</dt>
                <dd className="text-[13.5px] font-semibold text-ink">{d.dynamic_data[f.key] || "—"}</dd>
              </div>
            ))}
            {[
              ["Class applied", d.class ? `${d.class.name}${d.class.section ? `-${d.class.section}` : ""}` : "—"],
              ["Parent email", d.parentEmail ?? "—"],
              ["Parent phone", d.parentContact ?? "—"],
              ["Link valid until", fmtDate(d.linkExpiresAt)],
              ["Submitted", fmtDateTime(d.submittedAt)],
              ["Fee", `${inr(d.feeAmount)}${d.paymentRef ? ` · ref ${d.paymentRef}` : ""}`],
              ["Receipt", d.receiptNo ?? "—"],
              ["Principal signature", d.signatureName ? `${d.signatureName} · ${fmtDateTime(d.signedAt)}` : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{k}</dt>
                <dd className="text-[13.5px] font-semibold text-ink">{v}</dd>
              </div>
            ))}
            {s === "Admission Complete" && (
              <div className="sm:col-span-2 flex flex-wrap gap-2 border-t border-line pt-3">
                <span className="text-[12px] text-ink-3">Hand-off data:</span>
                {(["tc", "id-card", "fee"] as const).map((k) => (
                  <Button key={k} size="sm" variant="ghost" onClick={async () => {
                    try {
                      const data = await apiFetch(`/api/admissions/${id}/export/${k}`);
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `${k}-${d.rollNo ?? id}.json`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                    } catch (e) { notify(e instanceof Error ? e.message : "Export failed", "error"); }
                  }}>{k.toUpperCase()} JSON</Button>
                ))}
              </div>
            )}
          </dl>
        )}

        {tab === "docs" && (
          <div className="space-y-2">
            {docs.length === 0 && <p className="text-[13px] text-ink-3">No documents uploaded.</p>}
            {docs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span className="flex items-center gap-2 text-[13px]">
                  <Icon name="file" className="h-4 w-4 text-ink-3" />
                  <b className="capitalize">{doc.docType.replace(/_/g, " ")}</b>
                  <span className="text-ink-3">{doc.fileName} · {Math.ceil(doc.sizeBytes / 1024)} KB</span>
                  {doc.studentId && <Badge tone="emerald">Archived to student</Badge>}
                </span>
                <Button size="sm" variant="soft" onClick={() => view(doc)}><Icon name="eye" className="h-3.5 w-3.5" /> View</Button>
              </div>
            ))}
            {preview && (
              <div className="rounded-lg border border-line p-2">
                <div className="mb-2 flex items-center justify-between text-[12.5px]">
                  <b>{preview.name}</b>
                  <span className="flex gap-2">
                    <a href={preview.url} download={preview.name} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-2 !py-1 text-xs">Open</a>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setPreview(null)}>Close</button>
                  </span>
                </div>
                {preview.mime === "application/pdf"
                  ? (preview.url.startsWith("data:")
                    ? <iframe title={preview.name} src={preview.url} className="h-[28rem] w-full rounded" />
                    : /* X-Frame-Options blocks framing a signed URL; open the PDF in a tab instead */
                      <p className="py-6 text-center text-[13px] text-ink-3">PDF document — use <b>Open</b> to view it (link valid for a few minutes).</p>)
                  : /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={preview.url} alt={preview.name} className="mx-auto max-h-[28rem] rounded" />}
              </div>
            )}
          </div>
        )}

        {tab === "timeline" && (
          <ol className="space-y-2.5">
            {tl.steps.map((st) => (
              <li key={st.id} className="flex gap-3 text-[13px]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <div>
                  <p><b>{st.toStatus}</b> <span className="text-ink-3">· {st.action.replace(/_/g, " ")} by {st.actorRole ?? "—"} · {fmtDateTime(st.createdAt)}</span></p>
                  {st.remarks && <p className="text-ink-2">“{st.remarks}”</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {tab === "messages" && (
          <ul className="space-y-2">
            {tl.notifications.length === 0 && <p className="text-[13px] text-ink-3">No messages sent yet.</p>}
            {tl.notifications.map((n) => (
              <li key={n.id} className="rounded-lg border border-line px-3 py-2 text-[12.5px]">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone="sky">{n.channel}</Badge>
                  <b>{n.subject ?? "—"}</b>
                  <span className="text-ink-3">→ {n.recipient} · {fmtDateTime(n.createdAt)}</span>
                  <Badge tone={n.status === "failed" ? "rose" : n.status === "sent" ? "emerald" : "slate"}>{n.status}</Badge>
                </p>
                <p className="mt-1 text-ink-2">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog === "resubmit" && remarksDialog("Send back to parent for re-submission", "validate", "Sent back to the parent", "What needs fixing?")}
      {dialog === "vp-back" && remarksDialog("Send back to the Office Superintendent", "vp-send-back", "Sent back to the OS")}
      {dialog === "p-back" && remarksDialog("Send back to the Vice Principal", "principal-send-back", "Sent back to the VP")}
      {dialog === "reject" && remarksDialog("Reject application", "reject", "Application rejected", "Reason (shared with the parent)")}

      {dialog === "offline" && (
        <Modal open onClose={() => setDialog(null)} title="Record offline payment" size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!ref.reference_no.trim()}
              onClick={() => act("pay", { reference_no: ref.reference_no.trim(), payment_mode: ref.payment_mode }, "Payment recorded")}>Record</Button>
          </>}>
          <div className="space-y-3">
            <p className="text-[13px] text-ink-3">Fee due: {inr(d.feeAmount)}</p>
            <Field label="Mode">
              <Select aria-label="Payment mode" value={ref.payment_mode} onChange={(e) => setRef({ ...ref, payment_mode: e.target.value })}>
                {["Cash", "Cheque", "DD", "UPI", "Bank Transfer", "Card"].map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Reference no." required hint="Cheque / UTR / counter slip number">
              <Input value={ref.reference_no} maxLength={80} onChange={(e) => setRef({ ...ref, reference_no: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {dialog === "verify" && (
        <Modal open onClose={() => setDialog(null)} title="Verify payment & approve fee" size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={busy}
              onClick={() => act("verify-receipt", {
                ...(ref.receipt_no.trim() ? { receipt_no: ref.receipt_no.trim() } : {}),
                ...(receiptFile ? { receipt: receiptFile } : {}),
              }, "Fee approved")}>Approve</Button>
          </>}>
          <div className="space-y-3">
            <p className="text-[13px] text-ink-2">Paid {inr(d.feeAmount)} · reference <span className="font-mono">{d.paymentRef ?? "—"}</span></p>
            <Field label="Receipt number" hint="Leave blank to auto-generate (ADM-RCPT-YYYY-NNNN)">
              <Input value={ref.receipt_no} maxLength={60} onChange={(e) => setRef({ ...ref, receipt_no: e.target.value })} />
            </Field>
            <Field label="Receipt scan (optional)" hint="PDF / JPEG / PNG, max 5 MB">
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-[13px]"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return setReceiptFile(null);
                  try { setReceiptFile({ file_name: f.name, data_url: await readUpload(f) }); }
                  catch (err) { notify(err instanceof Error ? err.message : "Invalid file", "error"); e.target.value = ""; }
                }} />
            </Field>
          </div>
        </Modal>
      )}

      {dialog === "sign" && (
        <Modal open onClose={() => setDialog(null)} title="Digitally sign the admission" size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={text.trim().length < 3}
              onClick={() => act("principal-approve", { signature_name: text.trim() }, "Admission confirmed — student record created")}>
              Sign &amp; confirm admission
            </Button>
          </>}>
          <div className="space-y-3 text-[13px]">
            <p className="text-ink-2">
              Signing confirms the admission of <b>{d.studentName}</b> (roll {d.rollNo}, {d.house} house). The student master record is created,
              documents are archived and the parent is linked — this cannot be undone.
            </p>
            <Field label="Type your full name as signature" required>
              <Input value={text} maxLength={120} onChange={(e) => setText(e.target.value)} className="font-display text-[15px]" />
            </Field>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
