"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@/components/ui";

/** Shape of a row from `GET /api/notifications` (NotificationLog). */
export type Notice = {
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

const REF_META: Record<string, { icon: string; chip: string; label: string }> = {
  admission: { icon: "admissions", chip: "bg-brand-50 text-brand-600", label: "Admission" },
  attendance: { icon: "attendance", chip: "bg-ok-soft text-ok", label: "Attendance" },
  gate_pass: { icon: "door", chip: "bg-warn-soft text-warn", label: "Gate pass" },
  payroll: { icon: "wallet", chip: "bg-accent-50 text-accent-600", label: "Payroll" },
  cbt: { icon: "cbt", chip: "bg-info-soft text-info", label: "CBT" },
  fees: { icon: "fees", chip: "bg-ok-soft text-ok", label: "Fees" },
  discipline: { icon: "shield", chip: "bg-danger-soft text-danger", label: "Discipline" },
  leave: { icon: "leaves", chip: "bg-warn-soft text-warn", label: "Leave" },
};

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** Notifications created in the last 24h — the badge count, derived from real data. */
export function recentCount(items: Notice[]): number {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return items.filter((n) => new Date(n.createdAt).getTime() >= cutoff).length;
}

/**
 * Bell + hover preview. `href` is where "View all" goes: the staff log for office
 * roles, the portal message list for parents. `emptyText` lets each caller say what
 * an empty list means for them.
 */
export function NotificationStackPopover({
  items, href = "/notifications", emptyText = "Nothing has been sent from this branch yet.",
}: { items: Notice[]; href?: string; emptyText?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const shown = items.slice(0, 4);
  const newCount = recentCount(items);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link
        href={href}
        aria-label={`Notifications${newCount ? `, ${newCount} in the last 24 hours` : ""}`}
        className={`relative grid h-9 w-9 place-items-center rounded-xl border max-lg:h-10 max-lg:w-10 transition-all duration-200 ${
          isHovered
            ? "border-brand-300 bg-brand-50 text-brand-600 shadow-soft"
            : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2"
        }`}
      >
        <Icon
          name="bell"
          className="h-[18px] w-[18px] transition-transform duration-200"
        />
        {newCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {newCount}
          </span>
        )}
      </Link>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-80 max-lg:hidden rounded-xl border border-line bg-surface/97 p-3 shadow-pop backdrop-blur-xl sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-line px-1.5 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-display text-[13px] font-bold text-ink">Notifications</span>
                {newCount > 0 && (
                  <span className="badge badge-brand">{newCount} new</span>
                )}
              </div>
              <Link
                href={href}
                className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 hover:underline"
              >
                View all
              </Link>
            </div>

            {shown.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-ink-3">
                {emptyText}
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {shown.map((item, index) => {
                  const meta = REF_META[item.refType ?? ""] ?? {
                    icon: "bell",
                    chip: "bg-surface-2 text-ink-2",
                    label: item.channel,
                  };
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.2 }}
                      className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.chip}`}>
                        <Icon name={meta.icon} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[12px] font-bold text-ink">
                            {item.subject ?? `${meta.label} notification`}
                          </p>
                          <span className="shrink-0 text-[10px] font-medium text-ink-3">
                            {relative(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-2">
                          {item.body}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-[10px] text-ink-3">
                          <span className="uppercase tracking-wide">{item.channel}</span>
                          <span aria-hidden>·</span>
                          <span className="truncate">{item.recipient}</span>
                          {item.status !== "sent" && (
                            <span className={`font-bold ${item.status === "failed" ? "text-danger" : "text-warn"}`}>
                              {item.status}
                            </span>
                          )}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            <div className="mt-2 border-t border-line pt-2 text-center">
              <Link
                href={href}
                className="block rounded-lg py-1.5 text-[12px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Open notification centre →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
