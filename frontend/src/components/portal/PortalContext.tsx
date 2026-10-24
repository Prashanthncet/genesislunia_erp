"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/ui";

/* ── API shapes (backend/src/portal/portal.controller.ts) ───────── */

export type PortalMessage = {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  ref_type: string | null;
  status: string;
  created_at: string;
};

export type SubjectMark = { subject: string; code: string; score: number; max_score: number; pct: number | null; grade: string | null };

export type PortalChild = {
  id: string;
  full_name: string;
  admission_no: string;
  roll_no: string | null;
  house: string | null;
  status: string;
  class: { id: string; name: string; section: string | null } | null;
  attendance: { month: string; present: number; total: number; attendance_pct: number | null };
  fees: { total: number; paid: number; balance: number; overdue: number };
  latest_marks: { exam_id: string; exam_name: string; date: string; pct: number | null; grade: string | null; subjects: SubjectMark[] } | null;
  pending_leaves: number;
  pending_gate_passes: number;
  messages: PortalMessage[];
};

export type PortalOverview = { role: string; month: string; children: PortalChild[] };

export const classLabel = (c: PortalChild["class"]) =>
  c ? `${c.name}${c.section ? ` ${c.section}` : ""}` : "No class assigned";

/* ── Context: the children + which one is selected ─────────────── */

type PortalState = {
  overview: PortalOverview | null;
  error: string | null;
  child: PortalChild | null;
  selectChild: (id: string) => void;
  reload: () => Promise<void>;
};

const Ctx = createContext<PortalState>({
  overview: null, error: null, child: null, selectChild: () => {}, reload: async () => {},
});

const KEY = "portal_child";

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setOverview(await apiFetch<PortalOverview>("/api/portal/overview"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your portal");
    }
  }, []);

  useEffect(() => {
    try { setSelected(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
    void reload();
  }, [reload]);

  const selectChild = useCallback((id: string) => {
    setSelected(id);
    try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
  }, []);

  const child = useMemo(() => {
    const list = overview?.children ?? [];
    return list.find((c) => c.id === selected) ?? list[0] ?? null;
  }, [overview, selected]);

  const value = useMemo(() => ({ overview, error, child, selectChild, reload }), [overview, error, child, selectChild, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePortal = () => useContext(Ctx);

/** Pill switcher for parents with more than one child. Hidden for a single child / students. */
export function ChildSwitcher() {
  const { overview, child, selectChild } = usePortal();
  const list = overview?.children ?? [];
  if (list.length < 2) return null;
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 max-md:-mx-4 max-md:snap-x max-md:scroll-px-4 max-md:px-4" role="tablist" aria-label="Choose a child">
      {list.map((c) => {
        const active = c.id === child?.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => selectChild(c.id)}
            className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors max-md:min-h-12 max-md:snap-start ${
              active ? "border-brand-300 bg-brand-50 ring-1 ring-brand-100" : "border-line bg-surface hover:bg-surface-2"
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold ${
              active ? "bg-brand-700 text-white" : "bg-surface-2 text-ink-2"
            }`}>
              {c.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[11rem] truncate text-[13px] max-md:max-w-[9.5rem] font-semibold text-ink">{c.full_name}</span>
              <span className="block text-[11px] text-ink-3">{classLabel(c.class)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wraps every portal page: loading / error / "no child linked" states, then the
 * switcher and the page body for the selected child.
 */
export function PortalPage({
  children,
}: {
  children: (child: PortalChild) => React.ReactNode;
}) {
  const { overview, error, child, reload } = usePortal();
  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
        <Icon name="alert" className="h-6 w-6 text-danger" />
        <p className="text-[13.5px] text-ink-2">{error}</p>
        <button type="button" className="btn-primary" onClick={() => void reload()}>
          <Icon name="refresh" className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="skeleton h-12 w-64" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }
  if (!child) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Icon name="students" />
        </span>
        <p className="font-display text-[14px] font-bold text-ink">No student is linked to this login yet</p>
        <p className="max-w-sm text-[12.5px] text-ink-3">Ask the school office to link your child to your account.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ChildSwitcher />
      {children(child)}
    </div>
  );
}
