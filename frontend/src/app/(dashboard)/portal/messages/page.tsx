"use client";

import { useState } from "react";
import { relativeTime } from "@/lib/format";
import { useMe, ROLE } from "@/lib/auth";
import { Badge, Card, CardHead, EmptyState, Icon, PageHeader, Tabs } from "@/components/ui";
import { PortalPage, usePortal, type PortalChild, type PortalMessage } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState } from "@/components/portal/bits";
import { PortalNotices } from "@/components/notices/PortalNotices";

const CHANNEL_ICON: Record<string, string> = { sms: "phone", email: "mail", whatsapp: "phone" };

function MessagesBody({ child }: { child: PortalChild }) {
  const { data, error, loading, reload } = useChildData<PortalMessage[]>(child.id, "messages");
  return (
    <Card>
      <CardHead icon="mail" title="SMS & email from the school" subtitle={`About ${child.full_name}. Codes and passwords are hidden.`} />
      <PanelState loading={loading} error={error} reload={reload} />
      {data && data.length === 0 && <EmptyState icon="mail" title="No messages yet" />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((m) => (
            <li key={m.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                <Icon name={CHANNEL_ICON[m.channel] ?? "bell"} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13px] font-semibold text-ink">{m.subject ?? `${m.channel.toUpperCase()} message`}</p>
                  <span className="shrink-0 text-[11px] text-ink-3" title={new Date(m.created_at).toLocaleString("en-IN")}>
                    {relativeTime(m.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">{m.body}</p>
                <p className="mt-1 flex items-center gap-2 text-[10.5px] uppercase tracking-wide text-ink-3">
                  {m.channel}
                  {m.status === "failed" && <Badge tone="rose">not delivered</Badge>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function PortalMessagesPage() {
  const { me } = useMe();
  const { overview } = usePortal();
  const [tab, setTab] = useState<"notices" | "messages">("notices");
  // Parents with more than one child see who each notice is for.
  const showChildLabels = me?.role === ROLE.PARENT && (overview?.children.length ?? 0) > 1;
  return (
    <div className="space-y-4">
      <PageHeader icon="bell" title="Notices & messages" subtitle="Notices from the school and class teachers, plus SMS and email the school sent you." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ id: "notices", label: "Notices" }, { id: "messages", label: "SMS & email" }] as const}
      />
      {tab === "notices"
        ? <PortalNotices showChildLabels={showChildLabels} />
        : <PortalPage>{(child) => <MessagesBody key={child.id} child={child} />}</PortalPage>}
    </div>
  );
}
