"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Icon } from "@/components/ui";
import type { NavGroup, NavItem } from "@/lib/nav";

/**
 * Material 3 navigation bar for phones and tablets (<1024px only — the sidebar takes over
 * on desktop). Four primary destinations for the signed-in role + "More", which opens the
 * full navigation drawer, so nothing becomes unreachable.
 *
 * Destinations come from the same role-filtered nav the sidebar uses (navFor), so the bar
 * can never show a page the role may not open.
 */

/** Most-used destinations per role, in priority order. Anything not allowed is skipped. */
const PRIORITY: Record<string, string[]> = {
  parent: ["/portal", "/portal/attendance", "/portal/fees", "/portal/messages"],
  student: ["/portal", "/portal/timetable", "/cbt", "/portal/results"],
  teacher: ["/", "/attendance", "/timetable", "/academics"],
  hod: ["/", "/attendance", "/timetable", "/academics"],
  warden: ["/", "/gate", "/hostel", "/students"],
  security: ["/", "/gate", "/leaves", "/staff"],
  accounts: ["/", "/fees", "/admissions", "/reports"],
  admission_officer: ["/", "/admissions", "/students", "/notifications"],
  office_superintendent: ["/", "/admissions", "/students", "/fees"],
  hr: ["/", "/staff", "/leaves", "/students"],
  discipline_officer: ["/", "/discipline", "/students", "/leaves"],
};
const DEFAULT_PRIORITY = ["/", "/students", "/attendance", "/admissions", "/fees", "/reports"];

/** Short labels that fit under an icon on a 360px phone. */
const SHORT: Record<string, string> = {
  "/": "Home",
  "/portal": "Home",
  "/portal/attendance": "Attendance",
  "/portal/fees": "Fees",
  "/portal/messages": "Notices",
  "/portal/timetable": "Timetable",
  "/portal/results": "Results",
  "/cbt": "Tests",
  "/gate": "Gate",
  "/leaves": "Leaves",
  "/staff": "Staff",
  "/notifications": "Messages",
  "/admissions": "Admissions",
  "/discipline": "Discipline",
};

export function MobileBottomNav({
  role, groups, activeHref, badges, onMore, moreOpen,
}: {
  role: string | null;
  groups: NavGroup[];
  activeHref: string | undefined;
  badges: Record<string, number>;
  onMore: () => void;
  moreOpen: boolean;
}) {
  const items = useMemo(() => {
    const all = groups.flatMap((g) => g.items);
    const byHref = new Map<string, NavItem>();
    for (const i of all) if (!byHref.has(i.href)) byHref.set(i.href, i);
    const wanted = [...(PRIORITY[role ?? ""] ?? DEFAULT_PRIORITY), ...all.map((i) => i.href)];
    const picked: NavItem[] = [];
    for (const href of wanted) {
      const item = byHref.get(href);
      if (item && !picked.some((p) => p.href === item.href)) picked.push(item);
      if (picked.length === 4) break;
    }
    return picked;
  }, [groups, role]);

  const activeInBar = items.some((i) => i.href === activeHref);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "var(--m-safe-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      <ul className="mx-auto flex h-[var(--m-nav-h)] max-w-xl items-stretch justify-around px-1">
        {items.map((item) => {
          const active = item.href === activeHref;
          const count = badges[item.href] ?? 0;
          return (
            <li key={item.href} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 pt-1.5 text-center active:scale-[0.97]"
                style={{ transition: "transform 120ms var(--ease-soft)" }}
              >
                <span
                  className={`relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 ${
                    active ? "bg-brand-50 text-brand-700" : "text-ink-3 group-active:bg-surface-2"
                  }`}
                >
                  <Icon name={item.icon} className="h-[20px] w-[20px]" />
                  {count > 0 && (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                  {count > 0 && <span className="sr-only">, {count} new</span>}
                </span>
                <span className={`w-full truncate text-[11.5px] leading-tight ${active ? "font-bold text-brand-700" : "font-medium text-ink-2"}`}>
                  {SHORT[item.href] ?? item.name}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreOpen}
            aria-label="More: open all sections"
            className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 pt-1.5 active:scale-[0.97]"
            style={{ transition: "transform 120ms var(--ease-soft)" }}
          >
            <span
              className={`grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 ${
                moreOpen || (!activeInBar && activeHref) ? "bg-brand-50 text-brand-700" : "text-ink-3 group-active:bg-surface-2"
              }`}
            >
              <Icon name="menu" className="h-[20px] w-[20px]" />
            </span>
            <span className={`text-[11.5px] leading-tight ${moreOpen || (!activeInBar && activeHref) ? "font-bold text-brand-700" : "font-medium text-ink-2"}`}>
              More
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
