"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, isPortal, R, useMe } from "@/lib/auth";
import { TableView } from "@/components/TableView";
import { CardBody, CardEmpty, CardGrid, Chip, IconTile, RecordCard, StatusPill, type Tone } from "@/components/RecordCard";
import { relativeTime } from "@/lib/format";
import {
  Badge, Button, Card, CardHead, EmptyState, Field, Icon, IconButton,
  Input, Modal, PageHeader, Select, SkeletonRows, StatCard, Tabs, Textarea, useToast,
} from "@/components/ui";
import { NoticeHistory } from "@/components/notices/NoticeHistory";
import { confirmAction } from "@/components/confirm";
import { MobileFilters } from "@/components/mobile/MobileFilters";

/** A row of `notification_logs` — an outbound delivery attempt, not an inbox item. */
type NotificationLog = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  refType: string | null;
  refId: string | null;
  status: string;
  createdAt: string;
};

type ClassItem = { id: string; name: string; section: string | null };
type BroadcastResult = {
  dispatched: number;
  sent: number;
  failed: number;
  mocked: number;
  skipped: number;
};

type Audience = "all_students" | "all_staff" | "class" | "custom";

const STATUS_TONE: Record<string, "emerald" | "rose" | "amber" | "slate"> = {
  sent: "emerald",
  failed: "rose",
  mocked: "amber",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Delivered",
  failed: "Failed",
  mocked: "Not sent",
};

const CHANNEL_ICON: Record<string, string> = {
  email: "mail",
  sms: "phone",
  whatsapp: "phone",
};

const REF_LABEL: Record<string, string> = {
  broadcast: "Broadcast",
  admission: "Admission",
  attendance: "Attendance",
  gate_pass: "Gate pass",
  payroll: "Payroll",
  cbt: "CBT",
  incident: "Discipline",
  staff_leave: "Staff leave",
  fee: "Fees",
  fees: "Fees",
  student_leave: "Student leave",
  assignment: "Assignment",
  discipline: "Discipline",
  leave: "Leave",
};

const emptyDraft = {
  channel: "email",
  audience: "all_students" as Audience,
  classId: "",
  subject: "",
  body: "",
  customRecipients: "",
};

export default function NotificationsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  // Server-side history filters: per-applicant / per-record (ref_type + ref_id) and recipient search.
  const [refType, setRefType] = useState("");
  const [refId, setRefId] = useState("");
  const [recipientQ, setRecipientQ] = useState("");
  const { me, loading: meLoading } = useMe();
  const portal = isPortal(me);
  const canLog = hasRole(me, R.NOTIFICATION_LOG);
  const canBroadcast = hasRole(me, R.BROADCAST);
  // Student notices: anyone who can open this page and post notices (teachers use Academics).
  const canNotice = !portal && hasRole(me, [...R.BROADCAST, ...R.TEACHING]);
  const [view, setView] = useState<"log" | "notices">("log");

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid|cannot/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const loadAll = useCallback(async () => {
    if (!portal && !canLog) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (refType) params.set("ref_type", refType);
      if (refId.trim()) params.set("ref_id", refId.trim());
      if (recipientQ.trim()) params.set("recipient", recipientQ.trim());
      const [notes, cls] = await Promise.all([
        apiFetch<NotificationLog[]>(portal ? "/api/notifications/mine" : `/api/notifications?${params.toString()}`),
        canBroadcast ? apiFetch<ClassItem[]>("/api/classes") : Promise.resolve([] as ClassItem[]),
      ]);
      setLogs(Array.isArray(notes) ? notes : []);
      setClasses(Array.isArray(cls) ? cls : []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [portal, canLog, canBroadcast, refType, refId, recipientQ]);

  useEffect(() => {
    // Debounce typing in the server-side filters.
    const t = setTimeout(() => { loadAll(); }, 250);
    return () => clearTimeout(t);
  }, [loadAll]);

  /** Jump to the full history of one applicant / record. */
  const showHistory = (n: NotificationLog) => {
    if (!n.refType || !n.refId) return;
    setRefType(n.refType);
    setRefId(n.refId);
  };

  const sendBroadcast = async () => {
    if (!draft.body.trim()) return setMessage("Message body is required");
    if (draft.audience === "class" && !draft.classId) return setMessage("Select a class to send to");
    if (draft.audience === "custom" && !draft.customRecipients.trim()) {
      return setMessage("Enter at least one recipient");
    }
    const cls = classes.find((c) => c.id === draft.classId);
    const customCount = draft.customRecipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).length;
    const who = draft.audience === "all_students" ? "all students"
      : draft.audience === "all_staff" ? "all staff"
      : draft.audience === "class" ? `class ${cls ? `${cls.name}${cls.section ? ` ${cls.section}` : ""}` : "selected"}`
      : `${customCount} custom recipient${customCount === 1 ? "" : "s"}`;
    if (!(await confirmAction({
      title: `Send this ${draft.channel === "sms" ? "SMS" : draft.channel === "whatsapp" ? "WhatsApp message" : "email"} to ${who}?`,
      text: "The broadcast goes out to every recipient straight away and cannot be recalled.",
      confirmText: "Send broadcast",
      tone: "primary",
    }))) return;

    setSending(true);
    try {
      const res = await apiFetch<BroadcastResult>("/api/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({
          channel: draft.channel,
          audience: draft.audience,
          class_id: draft.audience === "class" ? draft.classId : undefined,
          subject: draft.subject || undefined,
          body: draft.body,
          recipients: draft.audience === "custom" ? draft.customRecipients : undefined,
        }),
      });

      const parts = [`${res.dispatched} logged`];
      if (res.sent) parts.push(`${res.sent} delivered`);
      if (res.failed) parts.push(`${res.failed} failed`);
      if (res.mocked) parts.push(`${res.mocked} awaiting gateway`);
      if (res.skipped) parts.push(`${res.skipped} unreachable`);
      setMessage(`Broadcast queued — ${parts.join(", ")}.`);
      setDraft(emptyDraft);
      setShowComposer(false);
      await loadAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setSending(false);
    }
  };

  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const counts = useMemo(() => {
    const sent = logs.filter((n) => n.status === "sent").length;
    const failed = logs.filter((n) => n.status === "failed").length;
    return { sent, failed, pending: logs.length - sent - failed };
  }, [logs]);

  const filtered = useMemo(
    () =>
      logs.filter((n) => {
        if (channel && n.channel !== channel) return false;
        if (status && n.status !== status) return false;
        if (search) {
          const hay = `${n.subject ?? ""} ${n.body} ${n.recipient}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      }),
    [logs, channel, status, search],
  );

  const CARD_CHANNEL: Record<string, { icon: string; tone: Tone }> = {
    email: { icon: "mail", tone: "blue" },
    sms: { icon: "phone", tone: "teal" },
    whatsapp: { icon: "bell", tone: "ok" },
  };
  const CARD_STATUS_TONE: Record<string, Tone> = { sent: "ok", failed: "danger", mocked: "warn" };

  /** Card view: a compact message card — channel tile, headline + 2-line preview, mono recipient, when it went out. */
  const logCards = (
    <CardGrid
      min="20rem"
      empty={
        loading ? (
          <CardEmpty title="Loading messages…" icon="bell" />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <CardEmpty title="No messages match these filters" hint="Clear the filters, or send your first announcement with the composer." icon="bell" />
            <Button variant="primary" onClick={() => setShowComposer(true)}>
              <Icon name="upload" className="h-4 w-4" /> New broadcast
            </Button>
          </div>
        )
      }
    >
      {loading ? null : filtered.map((n) => {
        const ch = CARD_CHANNEL[n.channel] ?? { icon: "mail", tone: "slate" as Tone };
        const tone = CARD_STATUS_TONE[n.status] ?? "slate";
        return (
          <RecordCard key={n.id} rail={tone}>
            <CardBody className="!gap-2.5">
              <div className="flex items-start gap-3">
                <IconTile name={ch.icon} tone={ch.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{n.channel}</span>
                    <time className="tnum shrink-0 text-[11.5px] text-ink-3" dateTime={n.createdAt} title={fmtDate(n.createdAt)}>
                      {relativeTime(n.createdAt)}
                    </time>
                  </div>
                  <h3 className="mt-0.5 truncate text-[14px] font-semibold leading-snug text-ink">
                    {n.subject ?? n.body.slice(0, 70)}
                  </h3>
                </div>
              </div>
              <p className="line-clamp-2 text-[12.5px] text-ink-3">{n.body}</p>
              <p className="truncate font-mono text-[12px] text-ink-2" title={n.recipient}>
                <span className="sr-only">Recipient: </span>{n.recipient}
              </p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <Chip icon="flag">
                  {REF_LABEL[n.refType ?? ""] ?? (n.refType ? n.refType.replace(/_/g, " ") : "System")}
                </Chip>
                <StatusPill status={STATUS_LABEL[n.status] ?? n.status} tone={tone} />
              </div>
            </CardBody>
          </RecordCard>
        );
      })}
    </CardGrid>
  );

  const audienceHint: Record<Audience, string> = {
    all_students: "Every active student on this branch.",
    all_staff: "All active staff members.",
    class: "Students of one class section.",
    custom: "A manual list of addresses or numbers.",
  };

  if (!meLoading && me && !portal && !canLog) {
    return (
      <div className="card">
        <EmptyState icon="lock" title="You don't have access to this page" hint="The notification log is available to the office, admissions and leadership." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon="bell"
        eyebrow="Insights"
        title={portal ? "Messages" : "Notifications"}
        subtitle={portal ? "Messages the school has sent to you or about your child." : "Outbound SMS and email delivery log, announcements, and student notices for the portal."}
        actions={canBroadcast && view === "log" &&
          <Button variant="primary" onClick={() => setShowComposer(true)}>
            <Icon name="upload" className="h-4 w-4" /> New broadcast
          </Button>
        }
      />

      {canNotice && (
        <Tabs
          value={view}
          onChange={setView}
          tabs={[{ id: "log", label: "Delivery log" }, { id: "notices", label: "Student notices" }] as const}
        />
      )}

      {view === "notices" && canNotice ? <NoticeHistory /> : (<>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 max-md:grid-cols-2 max-md:gap-3">
        <StatCard label="Total logged" value={logs.length} icon="list" tone="brand" delay={0} />
        <StatCard label="Delivered" value={counts.sent} icon="check" tone="emerald" delay={40} hint="Confirmed by the gateway" />
        <StatCard label="Failed" value={counts.failed} icon="alert" tone="rose" delay={80} hint="Gateway rejected the send" />
        <StatCard
          label="Not sent"
          value={counts.pending}
          icon="clock"
          tone="amber"
          delay={120}
          hint="No gateway configured in dev"
        />
      </div>

      <Card>
        <CardHead
          title="Delivery log"
          subtitle={`${filtered.length} of ${logs.length} messages`}
          icon="filter"
          actions={
            <>
              <div className="relative max-md:w-full">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject, message, recipient…"
                  aria-label="Search messages"
                  className="w-full pl-9 sm:w-72"
                />
              </div>
              <MobileFilters active={[refType, refId, recipientQ, channel, status].filter((v) => v.trim()).length}>
              {!portal && (
                <>
                  <Select value={refType} onChange={(e) => { setRefType(e.target.value); if (!e.target.value) setRefId(""); }} className="w-auto max-md:min-w-[9rem] max-md:flex-1" aria-label="Filter by source">
                    <option value="">All sources</option>
                    {Object.entries(REF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  <Input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="Record / applicant id" aria-label="Record id" className="w-auto max-md:min-w-[9rem] max-md:flex-1 sm:w-48" />
                  <Input value={recipientQ} onChange={(e) => setRecipientQ(e.target.value)} placeholder="Recipient email / phone" aria-label="Recipient search" className="w-auto max-md:min-w-[9rem] max-md:flex-1 sm:w-52" />
                  {(refType || refId || recipientQ) && (
                    <Button size="sm" variant="ghost" onClick={() => { setRefType(""); setRefId(""); setRecipientQ(""); }}>Clear</Button>
                  )}
                </>
              )}
              <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-auto max-md:min-w-[9rem] max-md:flex-1" aria-label="Filter by channel">
                <option value="">All channels</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto max-md:min-w-[9rem] max-md:flex-1" aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="sent">Delivered</option>
                <option value="failed">Failed</option>
                <option value="mocked">Not sent</option>
              </Select>
              </MobileFilters>
              <IconButton name="refresh" label="Reload log" onClick={loadAll} variant="soft" />
            </>
          }
        />

        <div className="table-wrap">
          <TableView id="t1" cards={logCards}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Message</th>
                <th className="w-32">Channel</th>
                <th className="w-56">Recipient</th>
                <th className="w-32">Source</th>
                <th className="w-40">Status</th>
                <th className="w-44">Sent</th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows rows={6} cols={6} />
            ) : (
              <tbody>
                {filtered.map((n) => (
                  <tr key={n.id}>
                    <td className="max-w-md">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {n.subject ?? n.body.slice(0, 70)}
                      </p>
                      {n.subject && (
                        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-3">{n.body}</p>
                      )}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium capitalize text-ink-2">
                        <Icon name={CHANNEL_ICON[n.channel] ?? "mail"} className="h-3.5 w-3.5 text-ink-3" />
                        {n.channel}
                      </span>
                    </td>
                    <td className="truncate text-[12.5px] text-ink-2">{n.recipient}</td>
                    <td>
                      <Badge tone="slate">
                        {REF_LABEL[n.refType ?? ""] ?? (n.refType ? n.refType.replace(/_/g, " ") : "System")}
                      </Badge>
                      {!portal && n.refType && n.refId && !(refType === n.refType && refId === n.refId) && (
                        <button type="button" onClick={() => showHistory(n)} className="mt-1 block text-[11.5px] font-medium text-accent-600 hover:underline">
                          History
                        </button>
                      )}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[n.status] ?? "slate"}>
                        {STATUS_LABEL[n.status] ?? n.status}
                      </Badge>
                    </td>
                    <td className="tnum text-[12px] text-ink-3">{fmtDate(n.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon="bell"
                        title="No messages match these filters"
                        hint="Clear the filters, or send your first announcement with the composer."
                        action={
                          <Button variant="primary" onClick={() => setShowComposer(true)}>
                            <Icon name="upload" className="h-4 w-4" /> New broadcast
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
          </TableView>
        </div>
      </Card>

      <Modal
        open={showComposer}
        onClose={() => setShowComposer(false)}
        title="Send a broadcast"
        subtitle="One message is logged per recipient, so delivery is traceable."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowComposer(false)}>Cancel</Button>
            <Button variant="primary" loading={sending} onClick={sendBroadcast}>
              <Icon name="upload" className="h-4 w-4" /> Send broadcast
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Audience" required hint={audienceHint[draft.audience]}>
            <Select
              value={draft.audience}
              onChange={(e) => setDraft({ ...draft, audience: e.target.value as Audience, classId: "" })}
            >
              <option value="all_students">All students</option>
              <option value="all_staff">All staff</option>
              <option value="class">A specific class</option>
              <option value="custom">Custom recipients</option>
            </Select>
          </Field>

          <Field label="Channel" required>
            <Select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </Select>
          </Field>

          {draft.audience === "class" && (
            <div className="sm:col-span-2">
              <Field label="Class" required>
                <Select value={draft.classId} onChange={(e) => setDraft({ ...draft, classId: e.target.value })}>
                  <option value="">Select a class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.section ?? ""}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {draft.audience === "custom" && (
            <div className="sm:col-span-2">
              <Field label="Recipients" required hint="Comma or newline separated email addresses or phone numbers.">
                <Textarea
                  value={draft.customRecipients}
                  onChange={(e) => setDraft({ ...draft, customRecipients: e.target.value })}
                  placeholder="parent@example.com, +91 98765 43210"
                  rows={3}
                />
              </Field>
            </div>
          )}

          <div className="sm:col-span-2">
            <Field label="Subject" hint="Used by email only; SMS and WhatsApp ignore it.">
              <Input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder="e.g. Annual Sports Day — 24 October"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Message" required hint={`${draft.body.length} characters`}>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Type the announcement parents will receive…"
                rows={5}
              />
            </Field>
          </div>

          {!process.env.NEXT_PUBLIC_NOTIFY_GATEWAY && (
            <p className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-warn/25 bg-warn-soft p-3 text-[12px] leading-relaxed text-warn">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No messaging gateway is configured, so messages are logged with status
                <strong> Not sent</strong> instead of being transmitted. Set
                <code className="mx-1 rounded bg-surface px-1 py-0.5">NOTIFY_WEBHOOK_URL</code>
                on the API to enable real delivery.
              </span>
            </p>
          )}
        </div>
      </Modal>
      </>)}
    </div>
  );
}
