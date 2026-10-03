"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, EmptyState, Icon, PageHeader, Reveal, Select, Skeleton, StatCard, useToast } from "@/components/ui";

type NotificationLog = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  refType: string | null;
  status: string;
  createdAt: string;
};

const CHANNEL_TONE: Record<string, "sky" | "emerald" | "violet"> = {
  email: "sky",
  sms: "emerald",
  whatsapp: "violet",
};

const CHANNEL_STYLES: Record<string, string> = {
  email: "border-sky-200 bg-sky-50/70",
  sms: "border-emerald-200 bg-emerald-50/70",
  whatsapp: "border-violet-200 bg-violet-50/70",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationLog[]>([]);
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!error) return;
    toast.push(error, "error");
    setError("");
  }, [error, toast]);

  const load = (ch: string) => {
    setLoading(true);
    apiFetch<NotificationLog[]>(`/api/notifications${ch ? `?channel=${ch}` : ""}`)
      .then((data) => setItems(data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="bell"
          title="Notifications"
          subtitle="Outbound SMS/Email log from every module (dev: mock provider)."
          actions={
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              aria-label="Filter by channel"
              className="w-auto"
            >
              <option value="">All channels</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </Select>
          }
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Total Sent" value={items.length} tone="brand" icon="bell" />
        </Reveal>
        {(["sms", "email", "whatsapp"] as const).map((ch, i) => (
          <Reveal key={ch} delay={80 + i * 40}>
            <StatCard
              label={ch.toUpperCase()}
              value={items.filter((n) => n.channel === ch).length}
              tone={ch === "sms" ? "emerald" : ch === "email" ? "sky" : "violet"}
              icon="bell"
            />
          </Reveal>
        ))}
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading notifications">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {items.map((n, i) => (
            <Reveal key={n.id} delay={Math.min(i, 8) * 45}>
              <div className={`card card-hover flex items-start justify-between gap-4 border p-4 ${CHANNEL_STYLES[n.channel] ?? ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={CHANNEL_TONE[n.channel] ?? "slate"}>{n.channel}</Badge>
                    {n.refType && <Badge tone="slate">{n.refType}</Badge>}
                    {n.subject && <h3 className="text-sm font-bold text-slate-900">{n.subject}</h3>}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    <span>to {n.recipient}</span>
                    <span aria-hidden>·</span>
                    <span className="tnum">{new Date(n.createdAt).toLocaleString()}</span>
                    <span aria-hidden>·</span>
                    <span className={n.status === "mocked" ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
                      {n.status}
                    </span>
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 text-slate-500">
                  <Icon name={n.channel === "email" ? "reports" : "bell"} className="h-4 w-4" />
                </span>
              </div>
            </Reveal>
          ))}
          {items.length === 0 && (
            <div className="card">
              <EmptyState
                icon="bell"
                title="No notifications yet"
                hint="They appear here when modules send SMS or email — try marking a student absent or recording a fee payment."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
