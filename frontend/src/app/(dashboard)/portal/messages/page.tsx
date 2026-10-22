"use client";

import { relativeTime } from "@/lib/format";
import { Badge, Card, CardHead, EmptyState, Icon, PageHeader } from "@/components/ui";
import { PortalPage, type PortalChild, type PortalMessage } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState } from "@/components/portal/bits";

const CHANNEL_ICON: Record<string, string> = { sms: "phone", email: "mail", whatsapp: "phone" };

function MessagesBody({ child }: { child: PortalChild }) {
  const { data, error, loading, reload } = useChildData<PortalMessage[]>(child.id, "messages");
  return (
    <Card>
      <CardHead icon="bell" title="Messages from the school" subtitle={`About ${child.full_name}`} />
      <PanelState loading={loading} error={error} reload={reload} />
      {data && data.length === 0 && <EmptyState icon="bell" title="No messages yet" />}
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
  return (
    <div className="space-y-4">
      <PageHeader icon="bell" title="Messages" subtitle="SMS, email and WhatsApp messages the school sent you. Codes and passwords are hidden." />
      <PortalPage>{(child) => <MessagesBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
