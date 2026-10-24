"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate, relativeTime } from "@/lib/format";
import { Badge, Button, Card, CardHead, EmptyState, Icon, Skeleton, Tabs, useToast } from "@/components/ui";
import type { PortalNotice } from "./types";

/** Fired after a notice is marked read so a nav badge can refresh `/api/notices/unread-count`. */
export const NOTICES_CHANGED_EVENT = "notices:changed";

/**
 * Portal notice board. A student sees notices for all students, their class and themselves;
 * a parent sees the same for every linked child, each card labelled with the child it is for.
 * Opening a card marks it read (per login).
 */
export function PortalNotices({ showChildLabels }: { showChildLabels: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<PortalNotice[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await apiFetch<PortalNotice[]>("/api/notices/mine"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notices");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (n: PortalNotice) => {
    if (n.read) return;
    setRows((rs) => rs?.map((r) => (r.id === n.id ? { ...r, read: true, read_at: new Date().toISOString() } : r)) ?? rs);
    try {
      await apiFetch(`/api/notices/${n.id}/read`, { method: "POST" });
      window.dispatchEvent(new Event(NOTICES_CHANGED_EVENT));
    } catch (e) {
      setRows((rs) => rs?.map((r) => (r.id === n.id ? { ...r, read: false, read_at: null } : r)) ?? rs);
      toast.push(e instanceof Error ? e.message : "Could not mark the notice as read", "error");
    }
  };

  const toggle = (n: PortalNotice) => {
    const next = open === n.id ? null : n.id;
    setOpen(next);
    if (next) void markRead(n);
  };

  const unread = rows?.filter((r) => !r.read).length ?? 0;
  const list = (rows ?? []).filter((r) => view === "all" || !r.read);

  return (
    <Card>
      <CardHead
        icon="bell"
        title="Notices"
        subtitle={rows === null ? "Loading…" : unread ? `${unread} unread of ${rows.length}` : `${rows.length} notice${rows.length === 1 ? "" : "s"}, all read`}
        actions={
          <Tabs
            value={view}
            onChange={setView}
            tabs={[{ id: "all", label: "All", count: rows?.length }, { id: "unread", label: "Unread", count: unread }] as const}
          />
        }
      />
      {error && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
          <p className="text-[13px] text-danger">{error}</p>
          <Button type="button" variant="soft" onClick={() => void load()}><Icon name="refresh" className="h-4 w-4" /> Retry</Button>
        </div>
      )}
      {!error && rows === null && (
        <div className="space-y-3 p-5" aria-busy>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}
      {!error && rows !== null && list.length === 0 && (
        <EmptyState
          icon="bell"
          title={view === "unread" && rows.length ? "You're all caught up" : "No notices yet"}
          hint={view === "unread" && rows.length ? "Every notice has been read." : "Notices from the school and class teachers will appear here."}
        />
      )}
      {!error && list.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-2">
          {list.map((n) => {
            const expanded = open === n.id;
            const important = n.priority === "important";
            return (
              <li key={n.id} className="min-w-0">
                <article
                  className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-soft transition-colors ${
                    important ? "border-danger-line" : "border-line"
                  } ${n.read ? "" : "ring-1 ring-brand-100"}`}
                >
                  <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${important ? "bg-danger" : n.read ? "bg-line-strong" : "bg-brand-700"}`} />
                  <button
                    type="button"
                    onClick={() => toggle(n)}
                    aria-expanded={expanded}
                    aria-controls={`notice-${n.id}`}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-surface-2/60"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-line-strong" : "bg-accent-500"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`text-[14px] leading-snug text-ink ${n.read ? "font-medium" : "font-semibold"}`}>{n.title}</span>
                        {important && <Badge tone="rose"><Icon name="alert" className="h-3 w-3" /> Important</Badge>}
                        <Badge tone={n.read ? "slate" : "brand"}>{n.read ? "Read" : "Unread"}</Badge>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
                        <time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString("en-IN")}>
                          {formatDate(n.created_at)} · {relativeTime(n.created_at)}
                        </time>
                        <span aria-hidden>·</span>
                        <span>{n.audience_label}</span>
                        {n.from && <><span aria-hidden>·</span><span>{n.from.name}</span></>}
                      </span>
                      {showChildLabels && n.children.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {n.children.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                              <Icon name="user" className="h-3 w-3" /> For {c.name}
                            </span>
                          ))}
                        </span>
                      )}
                      {!expanded && <span className="mt-2 line-clamp-2 block text-[12.5px] text-ink-2">{n.body}</span>}
                    </span>
                    <Icon name={expanded ? "minus" : "plus"} className="mt-1 h-4 w-4 shrink-0 text-ink-3" />
                  </button>
                  {expanded && (
                    <div id={`notice-${n.id}`} className="border-t border-line px-5 py-4">
                      <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{n.body}</p>
                      {n.expires_at && <p className="mt-3 text-[11.5px] text-ink-3">Shown until {formatDate(n.expires_at)}</p>}
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
