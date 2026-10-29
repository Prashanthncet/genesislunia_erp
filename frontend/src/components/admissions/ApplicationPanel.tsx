"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { R, hasRole, useMe } from "@/lib/auth";
import { Badge, Button, Field, Icon, Input, Modal, ProgressBar, Select, Skeleton, Tabs, Textarea } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
import { downloadQrPng, makeQrDataUrl } from "@/lib/qr";
import { Application, DocLink, PIPELINE, STATUS_TONE, docHref, fmtDate, fmtDateTime, inr, post, readUpload, stageOf } from "./shared";

type Detail = Application & {
  dynamic_data: Record<string, string>;
  template: { id: string; key: string; label: string; field_type?: string; is_required?: boolean }[];
  form_link: string | null;
  qr_data_url?: string | null;
};
type Doc = { id: string; docType: string; fileName: string; sizeBytes: number; studentId: string | null; createdAt: string };
type Step = { id: string; fromStatus: string | null; toStatus: string; action: string; actorRole: string | null; remarks: string | null; createdAt: string };
type Notif = { id: string; channel: string; recipient: string; subject: string | null; body: string; status: string; createdAt: string };
type ClassRow = { id: string; name: string; section: string | null };

type Dialog = null | "resubmit" | "offline" | "verify" | "vp-back" | "sign" | "p-back" | "reject";

/**
 * Application drawer: Google Forms-style response view, client-side + server-side QR code card,
 * documents with filters, step timeline with filters, notification history with filters, and role actions.
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
  const [houseChoice, setHouseChoice] = useState("");
  const [forwardTo, setForwardTo] = useState("VP (Vice Principal)");
  const [text, setText] = useState("");
  const [ref, setRef] = useState({ reference_no: "", payment_mode: "Cash", receipt_no: "" });
  const [receiptFile, setReceiptFile] = useState<{ file_name: string; data_url: string } | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Filter states across tabs
  const [formSearch, setFormSearch] = useState("");
  const [formFillFilter, setFormFillFilter] = useState<"all" | "filled" | "empty">("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [docSearch, setDocSearch] = useState("");
  const [tlRoleFilter, setTlRoleFilter] = useState<string>("all");
  const [msgChannelFilter, setMsgChannelFilter] = useState<string>("all");
  const [msgStatusFilter, setMsgStatusFilter] = useState<string>("all");

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
      setHouseChoice(detail.house ?? "");
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
    const who = d?.studentName ?? d?.parentName ?? "this application";
    const c = ((): { title: string; text?: string; confirmText: string; tone: "primary" | "danger" } => {
      switch (path) {
        case "validate":
          return (body as { is_valid?: boolean }).is_valid
            ? { title: `Mark documents valid for ${who}?`, text: "The parent will be asked to pay the admission fee.", confirmText: "Mark valid", tone: "primary" }
            : { title: `Send ${who} back for re-submission?`, text: "The parent will be asked to fix and re-submit the form.", confirmText: "Send back", tone: "primary" };
        case "reissue-link": return { title: `Re-issue the form link for ${who}?`, text: "A new link is sent to the parent.", confirmText: "Re-issue", tone: "primary" };
        case "pay": return { title: `Record offline payment for ${who}?`, confirmText: "Record", tone: "primary" };
        case "verify-receipt": return { title: `Approve the fee for ${who}?`, confirmText: "Approve", tone: "primary" };
        case "allocate": return { title: `Assign roll number and house to ${who}?`, confirmText: "Assign", tone: "primary" };
        case "vp-approve": return { title: `Approve ${who}?`, text: "The application goes to the Principal.", confirmText: "Approve", tone: "primary" };
        case "vp-send-back": return { title: `Send ${who} back to the OS?`, confirmText: "Send back", tone: "primary" };
        case "principal-send-back": return { title: `Send ${who} back to the VP?`, confirmText: "Send back", tone: "primary" };
        case "principal-approve": return { title: `Sign and confirm admission of ${who}?`, text: "The student record is created. This cannot be undone.", confirmText: "Sign & confirm", tone: "primary" };
        case "reject": return { title: `Reject ${who}?`, text: "The parent is notified with your reason. This cannot be undone.", confirmText: "Reject", tone: "danger" };
        default: return { title: `Continue with this action for ${who}?`, confirmText: "Confirm", tone: "primary" };
      }
    })();
    if (!(await confirmAction(c))) return;
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

  const qrTargetUrl = useMemo(() => {
    if (!d) return "";
    if (d.form_link) return d.form_link;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    return `${origin}/portal/admission?app=${encodeURIComponent(d.id)}`;
  }, [d]);

  const qrImageUrl = useMemo(() => {
    if (!d) return "";
    return d.qr_data_url || makeQrDataUrl(qrTargetUrl);
  }, [d, qrTargetUrl]);

  const handleDownloadQr = () => {
    if (!d) return;
    downloadQrPng(qrTargetUrl, `admission-qr-${d.loginId ?? d.id.slice(0, 8)}.png`, qrImageUrl);
    notify("QR code PNG downloaded");
  };

  const filteredTemplate = useMemo(() => {
    if (!d) return [];
    const q = formSearch.trim().toLowerCase();
    return d.template.filter((f) => {
      const ans = (d.dynamic_data[f.key] ?? "").trim();
      if (formFillFilter === "filled" && !ans) return false;
      if (formFillFilter === "empty" && ans) return false;
      if (q && !f.label.toLowerCase().includes(q) && !ans.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [d, formSearch, formFillFilter]);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return docs.filter((doc) => {
      if (docTypeFilter !== "all" && doc.docType !== docTypeFilter) return false;
      if (q && !doc.fileName.toLowerCase().includes(q) && !doc.docType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, docTypeFilter, docSearch]);

  const filteredSteps = useMemo(() => {
    if (tlRoleFilter === "all") return tl.steps;
    return tl.steps.filter((st) => (st.actorRole ?? "system") === tlRoleFilter);
  }, [tl.steps, tlRoleFilter]);

  const filteredMessages = useMemo(() => {
    return tl.notifications.filter((n) => {
      if (msgChannelFilter !== "all" && n.channel !== msgChannelFilter) return false;
      if (msgStatusFilter !== "all" && n.status !== msgStatusFilter) return false;
      return true;
    });
  }, [tl.notifications, msgChannelFilter, msgStatusFilter]);

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
        <span className="flex flex-wrap items-center gap-2 max-md:w-full max-md:[&>*]:flex-1">
          <Badge tone="violet">Roll No: Automatic</Badge>
          <Select aria-label="Class for roll number" value={classId} onChange={(e) => setClassId(e.target.value)} className="w-auto max-md:min-w-[9rem]">
            <option value="">{d.class ? `${d.class.name}${d.class.section ? `-${d.class.section}` : ""} (applied)` : "Class…"}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? `-${c.section}` : ""}</option>)}
          </Select>
          <Select aria-label="House allotment" value={houseChoice} onChange={(e) => setHouseChoice(e.target.value)} className="w-auto max-md:min-w-[9rem]">
            <option value="">House: Auto (Balanced)</option>
            {["Shivaji", "Tagore", "Ashoka", "Raman", "Red", "Blue", "Green", "Yellow"].map((h) => (
              <option key={h} value={h}>House: {h} (Manual)</option>
            ))}
          </Select>
          <Select aria-label="Forward stage (Clerk -> AO -> VP)" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} className="w-auto max-md:min-w-[10rem]">
            <option value="Clerk (OS) -> AO -> VP">Stage: Clerk → AO → VP</option>
            <option value="AO (Admission Officer)">Forward to: AO (Admission Officer)</option>
            <option value="VP (Vice Principal)">Forward to: VP (Vice Principal)</option>
            <option value="Clerk (OS)">Forward to: Clerk (OS)</option>
          </Select>
          <Button variant="primary" loading={busy} onClick={() => act("allocate", { ...(classId ? { class_id: classId } : {}), ...(houseChoice ? { house: houseChoice } : {}), ...(forwardTo ? { forward_to: forwardTo } : {}) }, "Roll number (automatic) and house assigned")}>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[s] ?? "sky"}>{s}</Badge>
            {d.rollNo && <Badge tone="violet">Roll {d.rollNo}</Badge>}
            {d.house && <Badge tone="teal">{d.house} house</Badge>}
            <Badge tone={d.paymentStatus === "Verified" ? "emerald" : d.paymentStatus === "Paid" ? "teal" : "amber"}>Fee {d.paymentStatus}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {d.form_link && (
              <a href={d.form_link} target="_blank" rel="noreferrer" className="btn-soft !px-2.5 !py-1 text-xs">
                Parent form <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
              </a>
            )}
            <Button size="sm" variant="soft" onClick={() => setShowQr((v) => !v)}>
              <Icon name="qr" className="h-3.5 w-3.5" /> {showQr ? "Hide QR" : "QR Code"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDownloadQr}>
              <Icon name="download" className="h-3.5 w-3.5" /> QR PNG
            </Button>
            <Button size="sm" variant="soft" onClick={() => download(`/api/admissions/${id}/summary.pdf`, `admission-summary-${d.loginId ?? id.slice(0, 8)}.pdf`)}>
              <Icon name="download" className="h-3.5 w-3.5" /> Summary PDF
            </Button>
          </div>
        </div>

        {showQr && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-center gap-4">
              {qrImageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qrImageUrl} alt="Application QR Code" className="h-24 w-24 rounded-xl border border-line bg-white p-1.5 shadow-2xs" />
              )}
              <div className="space-y-1">
                <p className="text-[13.5px] font-bold text-ink">Admission Form QR Code</p>
                <p className="text-xs text-ink-2">
                  Parent Login ID: <code className="font-mono font-bold">{d.loginId ?? "—"}</code> · Valid until: <b>{fmtDate(d.linkExpiresAt)}</b>
                </p>
                <p className="text-[11.5px] text-brand-700 break-all">{qrTargetUrl}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="soft" onClick={() => void navigator.clipboard?.writeText(qrTargetUrl).then(() => notify("Link copied"))}>
                <Icon name="copy" className="h-3.5 w-3.5" /> Copy Link
              </Button>
              <Button size="sm" variant="primary" onClick={handleDownloadQr}>
                <Icon name="download" className="h-3.5 w-3.5" /> Download QR
              </Button>
            </div>
          </div>
        )}

        <ProgressBar value={((stageOf(s) + 1) / PIPELINE.length) * 100} tone={s === "Rejected" ? "rose" : s === "Admission Complete" ? "emerald" : "brand"}
          label={`Step ${stageOf(s) + 1} of ${PIPELINE.length}`} />
        {d.remarks && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2"><b>Latest remarks:</b> {d.remarks}</p>}

        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "form" as const, label: "Form Responses", icon: "admissions", count: d.template.length },
          { id: "docs" as const, label: "Documents", icon: "file", count: docs.length },
          { id: "timeline" as const, label: "Timeline", icon: "activity", count: tl.steps.length },
          { id: "messages" as const, label: "Notifications", icon: "bell", count: tl.notifications.length },
        ]} />

        {tab === "form" && (
          <div className="space-y-4">
            {d.template.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 p-2.5">
                <div className="relative min-w-[12rem] flex-1">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                  <Input
                    value={formSearch}
                    onChange={(e) => setFormSearch(e.target.value)}
                    placeholder="Search question or response…"
                    className="pl-8 !py-1.5 text-xs"
                  />
                </div>
                <Select
                  aria-label="Filter form responses"
                  value={formFillFilter}
                  onChange={(e) => setFormFillFilter(e.target.value as "all" | "filled" | "empty")}
                  className="w-40 !py-1.5 text-xs"
                >
                  <option value="all">All fields ({d.template.length})</option>
                  <option value="filled">Answered only</option>
                  <option value="empty">Empty only</option>
                </Select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTemplate.map((f, idx) => {
                const val = d.dynamic_data[f.key];
                return (
                  <div key={f.id} className="rounded-xl border border-line border-l-4 border-l-brand-600 bg-surface p-3.5 shadow-2xs">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                      {idx + 1}. {f.label}
                    </p>
                    <p className="mt-1 text-[14px] font-bold text-ink max-md:[overflow-wrap:anywhere]">
                      {val || <span className="font-normal italic text-ink-3">Not answered</span>}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-line bg-surface-2/40 p-4">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-ink-3">Application &amp; Office Summary</p>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 max-md:grid-cols-1">
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
                    <dd className="text-[13.5px] font-semibold text-ink max-md:[overflow-wrap:anywhere]">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {s === "Admission Complete" && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
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
          </div>
        )}

        {tab === "docs" && (
          <div className="space-y-3">
            {docs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 p-2.5">
                <div className="relative min-w-[12rem] flex-1">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                  <Input
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Filter by file name…"
                    className="pl-8 !py-1.5 text-xs"
                  />
                </div>
                <Select aria-label="Filter document type" value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)} className="w-48 !py-1.5 text-xs">
                  <option value="all">All document types ({docs.length})</option>
                  {Array.from(new Set(docs.map((x) => x.docType))).map((dt) => (
                    <option key={dt} value={dt}>{dt.replace(/_/g, " ")}</option>
                  ))}
                </Select>
              </div>
            )}

            {filteredDocs.length === 0 && <p className="text-[13px] text-ink-3">No documents match.</p>}
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-[13px] max-md:min-w-0 max-md:flex-wrap">
                  <Icon name="file" className="h-4 w-4 text-brand-700 max-md:shrink-0" />
                  <b className="capitalize">{doc.docType.replace(/_/g, " ")}</b>
                  <span className="text-ink-3 max-md:break-all">{doc.fileName} · {Math.ceil(doc.sizeBytes / 1024)} KB</span>
                  {doc.studentId && <Badge tone="emerald">Archived to student</Badge>}
                </span>
                <Button size="sm" variant="soft" onClick={() => view(doc)}><Icon name="eye" className="h-3.5 w-3.5" /> View</Button>
              </div>
            ))}
            {preview && (
              <div className="rounded-lg border border-line p-2">
                <div className="mb-2 flex items-center justify-between text-[12.5px] max-md:gap-2">
                  <b className="max-md:min-w-0 max-md:break-all">{preview.name}</b>
                  <span className="flex gap-2 max-md:shrink-0">
                    <a href={preview.url} download={preview.name} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-2 !py-1 text-xs">Open</a>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setPreview(null)}>Close</button>
                  </span>
                </div>
                {preview.mime === "application/pdf"
                  ? (preview.url.startsWith("data:")
                    ? <iframe title={preview.name} src={preview.url} className="h-[28rem] w-full rounded" />
                    : <p className="py-6 text-center text-[13px] text-ink-3">PDF document — use <b>Open</b> to view it (link valid for a few minutes).</p>)
                  : /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={preview.url} alt={preview.name} className="mx-auto max-h-[28rem] rounded" />}
              </div>
            )}
          </div>
        )}

        {tab === "timeline" && (
          <div className="space-y-3">
            {tl.steps.length > 1 && (
              <div className="flex justify-end">
                <Select aria-label="Filter timeline by actor role" value={tlRoleFilter} onChange={(e) => setTlRoleFilter(e.target.value)} className="w-48 !py-1.5 text-xs">
                  <option value="all">All roles ({tl.steps.length})</option>
                  {Array.from(new Set(tl.steps.map((s) => s.actorRole ?? "system"))).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
            )}
            <ol className="space-y-2.5">
              {filteredSteps.map((st) => (
                <li key={st.id} className="flex gap-3 text-[13px]">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  <div className="max-md:min-w-0 max-md:[overflow-wrap:anywhere]">
                    <p><b>{st.toStatus}</b> <span className="text-ink-3">· {st.action.replace(/_/g, " ")} by {st.actorRole ?? "—"} · {fmtDateTime(st.createdAt)}</span></p>
                    {st.remarks && <p className="text-ink-2">“{st.remarks}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === "messages" && (
          <div className="space-y-3">
            {tl.notifications.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 p-2.5">
                <Select aria-label="Filter channel" value={msgChannelFilter} onChange={(e) => setMsgChannelFilter(e.target.value)} className="w-40 !py-1.5 text-xs">
                  <option value="all">All channels</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </Select>
                <Select aria-label="Filter delivery status" value={msgStatusFilter} onChange={(e) => setMsgStatusFilter(e.target.value)} className="w-40 !py-1.5 text-xs">
                  <option value="all">All statuses</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </Select>
              </div>
            )}
            <ul className="space-y-2">
              {filteredMessages.length === 0 && <p className="text-[13px] text-ink-3">No messages match.</p>}
              {filteredMessages.map((n) => (
                <li key={n.id} className="rounded-lg border border-line px-3 py-2 text-[12.5px] max-md:[overflow-wrap:anywhere]">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone="sky">{n.channel}</Badge>
                    <b>{n.subject ?? "—"}</b>
                    <span className="text-ink-3 max-md:min-w-0">→ {n.recipient} · {fmtDateTime(n.createdAt)}</span>
                    <Badge tone={n.status === "failed" ? "rose" : n.status === "sent" ? "emerald" : "slate"}>{n.status}</Badge>
                  </p>
                  <p className="mt-1 text-ink-2">{n.body}</p>
                </li>
              ))}
            </ul>
          </div>
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
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-[13px] max-md:w-full max-md:min-w-0"
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
          <div className="space-y-3">
            <p className="text-[12.5px] text-ink-3">
              Confirming creates the student master record, moves the admission documents into the student file, links the parent portal login, and unlocks the admission letter.
            </p>
            <Field label="Principal signature (full name)" required>
              <Input value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
