"use client";

/**
 * Genesis Lumia ERP — shared UI kit.
 *
 * The single source of visual truth for every screen: layout primitives, data
 * display, controls, feedback and motion. Everything reads from the design
 * tokens in `globals.css` (brand/accent/navy/ink/surface/semantic + the shadow
 * ladder), so re-skinning happens in one place.
 *
 * Conventions:
 *  - Icons are inline SVG on a 24px grid — never emoji as structural icons.
 *  - Motion is transform/opacity only, so nothing is invisible without it.
 *  - All animation honours `prefers-reduced-motion` (guard in globals.css).
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes,
  type TextareaHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useMobileBack } from "@/components/mobile/useMobileBack";

/* ── Portal ───────────────────────────────────────────────────── */

/**
 * Renders children straight into <body>. Every overlay (modal, drawer,
 * palette) must go through this: any ancestor with a transform, filter or
 * backdrop-filter becomes the containing block for `position: fixed`, which
 * pinned popups to the page column instead of the viewport.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return host ? createPortal(children, host) : null;
}

/* ── Icons ────────────────────────────────────────────────────── */

const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>,
  students: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6.4" /><path d="M17 14.6A6 6 0 0 1 21 20" /></>,
  admissions: <><path d="M4 5h16v15H4z" /><path d="M9 3v4M15 3v4M4 10h16" /><path d="m9 15 2 2 4-4" /></>,
  fees: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><circle cx="12" cy="12.5" r="2.6" /><path d="M6 9.5v0M18 15.5v0" /></>,
  attendance: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M8 3v3M16 3v3M3 9.5h18" /><path d="m8.5 14.5 2 2 4.5-4.5" /></>,
  timetable: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M9 13.5h.01M12 13.5h.01M15 13.5h.01M9 17h.01M12 17h.01" /></>,
  exams: <><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" /><path d="M8 12h8M8 16h5" /></>,
  cbt: <><rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M8 20.5h8M12 17v3.5" /><path d="m8.5 10.5 2.2 2.2 4.3-4.3" /></>,
  academics: <><path d="M3 7.5 12 4l9 3.5-9 3.5-9-3.5Z" /><path d="M6.5 9.8v4.4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V9.8" /><path d="M20.5 8v6" /></>,
  leaves: <><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M8 3v3M16 3v3M3.5 9.5h17" /><path d="m9 14.5 2 2 4-4" /></>,
  hostel: <><path d="M4 20V9l8-5 8 5v11" /><path d="M4 20h16" /><path d="M9.5 20v-4.5h5V20" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" /></>,
  discipline: <><path d="M12 3 5 6v5.5c0 4.3 2.9 8.1 7 9.5 4.1-1.4 7-5.2 7-9.5V6l-7-3Z" /><path d="M12 9v3.5M12 15.5h.01" /></>,
  staff: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M17.5 4.5 19 6" /></>,
  reports: <><path d="M4 20V9M10 20V4M16 20v-7M22 20H2" /></>,
  bell: <><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" /><path d="M10.5 19a2 2 0 0 0 3 0" /></>,
  logout: <><path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" /><path d="m17 15 3-3-3-3M20 12H10" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  copy: <><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></>,
  bed: <><path d="M3 18V6M3 14h18v4M21 14v-2.5a3 3 0 0 0-3-3h-7v5.5" /><circle cx="7" cy="10.5" r="1.8" /></>,
  hash: <path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" />,
  print: <><path d="M7 8V3h10v5" /><rect x="3.5" y="8" width="17" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  download: <><path d="M12 3v12" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 20h16" /></>,
  upload: <><path d="M12 16V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4 20h16" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8h.01" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4.2-4.2" /></>,
  filter: <path d="M4 5h16l-6.2 7.4V19l-3.6 2v-8.6L4 5Z" />,
  edit: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14.5 6.5 17.5 9.5" /></>,
  trash: <><path d="M4 7h16M9 7V4.5h6V7" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  arrowUpRight: <><path d="M7 17 17 7" /><path d="M9 7h8v8" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10.5h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.6 7 8.4 6 8.4-6" /></>,
  phone: <path d="M6 3h3l2 5-2.2 1.4a12 12 0 0 0 5.8 5.8L16 13l5 2v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.2 2 2 0 0 1 6 3Z" />,
  mapPin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Z" /><path d="M8 3v18" /></>,
  clipboard: <><path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /><rect x="9" y="2.5" width="6" height="3.5" rx="1" /><path d="M9 12h6M9 16h4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.1" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 2.9 8.1 7 9.5 4.1-1.4 7-5.2 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="11" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="m11 11 8-8M17 5l2 2M15 7l2 2" /></>,
  building: <><path d="M4 21V4h10v17" /><path d="M14 9h6v12" /><path d="M7 8h4M7 12h4M7 16h4M17 13h1M17 17h1" /></>,
  layers: <><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></>,
  trendUp: <><path d="m4 16 6-6 4 4 6-6" /><path d="M15 8h5v5" /></>,
  trendDown: <><path d="m4 8 6 6 4-4 6 6" /><path d="M15 16h5v-5" /></>,
  activity: <path d="M3 12h4l2.5-7 4 14L16 12h5" />,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.4-2.5 4" /><path d="M12 17.3h.01" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.4M4 13a8 8 0 0 0 14.3 4.4" /><path d="M20 4v7h-7M4 20v-7h7" /></>,
  star: <path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9L12 3.5Z" />,
  flag: <><path d="M5 21V4" /><path d="M5 5h11l-1.5 4L16 13H5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" /></>,
  door: <><path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" /><path d="M3 21h18" /><circle cx="12.5" cy="12" r="1" /></>,
  bus: <><rect x="4" y="4" width="16" height="12" rx="2.5" /><path d="M4 11h16" /><path d="M7 16v3M17 16v3" /><path d="M7.5 8h.01M16.5 8h.01" /></>,
  sparkles: <><path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" /><path d="M18.5 15.5 19 17l1.5.5L19 18l-.5 1.5L18 18l-1.5-.5L18 17l.5-1.5Z" /></>,
};

/** Inline stroke-icon set. Sizes are controlled by `className` (default 1.25rem). */
export function Icon({
  name, className = "h-5 w-5", strokeWidth = 1.75,
}: { name: keyof typeof PATHS | string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.spark}
    </svg>
  );
}

/* ── Motion primitives ────────────────────────────────────────── */

/**
 * Shared scroll-reveal behaviour.
 *
 * Deliberately applied to a single element rather than a wrapper: wrapping in
 * an extra div silently breaks CSS grid/flex placement, because the wrapper
 * becomes the grid item and the caller's `col-span` lands on the inner node.
 * Transform/opacity only, so content is legible even if it never animates.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(delay: number, y: number) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.06, rootMargin: "0px 0px -32px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return {
    ref,
    // Transform only — never opacity. If the observer never fires (no JS, a
    // print/preview renderer, a full-page screenshot), the content must still
    // be fully legible; the lift is the enhancement, not the visibility.
    // Settles on `none`, not an identity translate: a lingering transform turns
    // this element into the containing block for any fixed-position child.
    style: {
      transform: shown ? "none" : `translate3d(0,${y}px,0)`,
      transition: `transform 0.5s var(--ease-soft) ${delay}ms`,
    } as const,
  };
}

/** Fades + lifts children into view once, the first time they intersect. */
export function Reveal({
  children, delay = 0, className = "", y = 14,
}: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const { ref, style } = useReveal(delay, y);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/** Counts up to `value` with ease-out. Respects reduced motion by jumping. */
export function AnimatedNumber({
  value, prefix = "", suffix = "", decimals = 0, className = "",
}: { value: number | null; prefix?: string; suffix?: string; decimals?: number; className?: string }) {
  const [display, setDisplay] = useState(value ?? 0);
  const from = useRef(0);

  useEffect(() => {
    if (value === null || value === undefined) { setDisplay(0); return; }
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 850);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(origin + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const shown = display.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span className={`tnum ${className}`}>{prefix}{shown}{suffix}</span>;
}

/* ── Layout primitives ────────────────────────────────────────── */

/** Page title block. `icon` renders a tinted gradient tile; `actions` sits right. */
export function PageHeader({
  title, subtitle, actions, icon, eyebrow,
}: {
  title: string; subtitle?: string; actions?: ReactNode; icon?: string; eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 max-md:gap-3">
      <div className="flex min-w-0 items-start gap-3.5 max-md:gap-3">
        {icon && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white max-md:hidden">
            <Icon name={icon} />
          </span>
        )}
        {/* Phones get the same title + a short tagline in the app bar, so the block
            would only repeat it. Actions below it stay. */}
        <div className="min-w-0 max-md:hidden">
          {eyebrow && (
            <p className="mb-1 text-[12px] font-medium text-ink-3">{eyebrow}</p>
          )}
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-brand-700 max-md:text-[22px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-md:w-full">{actions}</div>}
    </header>
  );
}

/**
 * Standard white surface. The reveal is applied to the same element, so
 * `className` stays the grid/flex item — pass `lg:col-span-3` here, not on
 * an inner wrapper.
 */
export function Card({
  children, className = "", hover = false, delay = 0,
}: { children: ReactNode; className?: string; hover?: boolean; delay?: number }) {
  const { ref, style } = useReveal(delay, 14);
  return (
    <div ref={ref} style={style} className={`card ${hover ? "card-hover" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Header row for a card section — title left, actions right. */
export function CardHead({
  title, subtitle, actions, icon,
}: { title: string; subtitle?: string; actions?: ReactNode; icon?: string }) {
  return (
    <div className="card-head">
      {/* `min-w-[9rem]` + wrapping on .card-head means the actions drop to
          their own line in a narrow card instead of crushing this text. */}
      <div className="flex min-w-[9rem] flex-1 items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold leading-snug text-ink max-md:!text-[16px]">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-3">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-wrap">{actions}</div>}
    </div>
  );
}

// Every tone draws from the theme: navy/status/chart series. Tone names are
// kept for call-site compatibility; violet and pink no longer exist in the
// palette, so they resolve to the secondary blue and the gold series.
const STAT_TONES: Record<string, { chip: string; ring: string }> = {
  brand: { chip: "bg-brand-50 text-brand-700", ring: "bg-brand-700" },
  emerald: { chip: "bg-ok-soft text-ok-ink", ring: "bg-ok" },
  amber: { chip: "bg-warn-soft text-warn-ink", ring: "bg-warn" },
  rose: { chip: "bg-danger-soft text-danger-ink", ring: "bg-danger" },
  violet: { chip: "bg-brand-50 text-brand-500", ring: "bg-brand-500" },
  teal: { chip: "bg-teal-50 text-teal-700", ring: "bg-chart-3" },
  sky: { chip: "bg-info-soft text-info-ink", ring: "bg-chart-4" },
  pink: { chip: "bg-gold-soft text-gold-ink", ring: "bg-chart-5" },
};

/** KPI tile: label, hero number, delta. The number is always the loudest thing. */
export function StatCard({
  label, value, hint, tone = "brand", icon, prefix, suffix, decimals = 0,
  trend, trendPositive = true, delay = 0, className = "",
}: {
  label: string; value: number | null; hint?: string; tone?: keyof typeof STAT_TONES;
  icon?: string; prefix?: string; suffix?: string; decimals?: number;
  trend?: string; trendPositive?: boolean; delay?: number; className?: string;
}) {
  const t = STAT_TONES[tone] ?? STAT_TONES.brand;
  const { ref, style } = useReveal(delay, 14);
  const body = (
    <div ref={ref} style={style} className={`card card-hover relative overflow-hidden p-4 ${className}`}>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.ring}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-3">{label}</p>
        {icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${t.chip}`}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2.5">
        <p className="font-display text-[30px] font-bold leading-none tracking-tight text-ink max-md:text-[24px]">
          {value === null
            ? <span className="text-ink-3">—</span>
            : <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />}
        </p>
        {(trend || hint) && (
          <p className={`mt-2 flex items-center gap-1 text-[11.5px] font-semibold ${
            trend ? (trendPositive ? "text-ok" : "text-danger") : "text-ink-3"
          }`}>
            {trend && <Icon name={trendPositive ? "trendUp" : "trendDown"} className="h-3.5 w-3.5" />}
            <span>{trend ?? hint}</span>
          </p>
        )}
      </div>
    </div>
  );
  return body;
}

/* ── Controls ─────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "soft" | "ghost" | "danger" | "dark";
  loading?: boolean;
  size?: "sm" | "md";
};

const BTN_VARIANTS: Record<string, string> = {
  primary: "btn-primary",
  accent: "btn-accent",
  soft: "btn-soft",
  ghost: "btn-ghost",
  danger: "btn-danger",
  dark: "btn-dark",
};

export function Button({
  variant = "soft", loading, className = "", children, disabled, size = "md", ...rest
}: BtnProps) {
  return (
    <button
      className={`${BTN_VARIANTS[variant]} disabled:pointer-events-none disabled:opacity-50 ${
        size === "sm" ? "!min-h-8 !px-2.5 !py-1.5 !text-[12.5px] max-md:!min-h-10 max-md:!px-3 max-md:!text-[13.5px]" : ""
      } ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` becomes the accessible name + tooltip. */
export function IconButton({
  name, label, className = "", variant = "soft", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  name: string; label: string; variant?: keyof typeof BTN_VARIANTS;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`${BTN_VARIANTS[variant]} !px-2.5 !py-2 max-md:!px-3.5 ${className}`}
      {...rest}
    >
      <Icon name={name} className="h-4 w-4" />
    </button>
  );
}

export const Badge = ({
  tone = "slate", children, className = "",
}: {
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky" | "violet" | "brand" | "teal" | "accent";
  children: ReactNode; className?: string;
}) => (
  <span className={`badge badge-${tone} ${className}`}>{children}</span>
);

export function Field({
  label, hint, error, required, children,
}: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {error
        ? <span className="mt-1 block text-[11.5px] font-medium text-danger">{error}</span>
        : hint && <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

export const Input = ({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={`field ${className}`} {...rest} />
);

export const Select = ({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={`field ${className}`} {...rest}>
    {children}
  </select>
);

export const Textarea = ({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={`field ${className}`} rows={3} {...rest} />
);

export const Skeleton = ({
  className = "", style,
}: { className?: string; style?: CSSProperties }) => (
  <div className={`skeleton ${className}`} style={style} aria-hidden />
);

/** Placeholder for a table body while data loads — keeps column rhythm. */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c}><Skeleton className={`h-3.5 ${c === 0 ? "w-40" : "w-24"}`} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function EmptyState({ title, hint, icon = "sparkles", action }: {
  title: string; hint?: string; icon?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon name={icon} />
      </span>
      <div>
        <p className="font-display text-[14px] font-bold text-ink">{title}</p>
        {hint && <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

const PROGRESS_TONES = {
  brand: "bg-brand-700",
  emerald: "bg-ok",
  amber: "bg-warn",
  rose: "bg-danger",
  violet: "bg-brand-500",
  info: "bg-accent-500",
} as const;

export function ProgressBar({ value, tone = "brand", className = "", label }: {
  value: number; tone?: keyof typeof PROGRESS_TONES; className?: string; label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-line ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full origin-left rounded-full ${PROGRESS_TONES[tone]} transition-transform duration-700 ease-out`}
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

/* ── Segmented tabs ───────────────────────────────────────────── */

/** Segmented control with a sliding active pill. */
export function Tabs<T extends string>({
  tabs, value, onChange, className = "",
}: {
  tabs: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 p-1 max-md:flex max-md:max-w-full max-md:flex-nowrap m-scroll-x ${className}`}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative rounded-md px-3.5 py-1.5 text-[13px] font-semibold capitalize transition-all duration-200 max-md:min-h-10 max-md:shrink-0 max-md:snap-start max-md:whitespace-nowrap ${
              active
                ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
                : "text-ink-2 hover:bg-surface hover:text-ink"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 text-[11px] font-bold ${active ? "text-brand-500" : "text-ink-3"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────── */

/** Centred dialog: Escape to close, backdrop click to close, scroll locked. */
export function Modal({
  open, onClose, title, subtitle, children, footer, size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  useMobileBack(open, onClose);

  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl" }[size];

  return (
    <Portal>
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:p-6 max-md:items-stretch max-md:overflow-hidden max-md:!p-0">
      <div
        className="fixed inset-0 bg-navy-950/45 backdrop-blur-sm"
        style={{ animation: "fade-in 0.18s ease-out both" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 my-auto w-full ${width} animate-slide-up-sheet rounded-panel border border-line bg-surface shadow-pop m-page max-md:my-0 max-md:flex max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:flex-col max-md:rounded-none max-md:border-0 max-md:shadow-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 max-md:items-center max-md:justify-start max-md:gap-2 max-md:px-2 max-md:pb-2 max-md:pt-[calc(0.5rem+var(--m-safe-top))]">
          {/* Phones: app-bar back arrow (same close action). */}
          <button type="button" onClick={onClose} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 active:bg-surface-2 md:hidden">
            <Icon name="chevronLeft" className="h-5 w-5" />
          </button>
          <div className="min-w-0 max-md:flex-1">
            <h2 className="font-display text-[15px] font-bold tracking-tight text-ink max-md:truncate max-md:text-[18px]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-ink-3 max-md:truncate max-md:text-[12.5px]">{subtitle}</p>}
          </div>
          <span className="contents max-md:hidden"><IconButton name="x" label="Close" variant="ghost" onClick={onClose} /></span>
        </div>
        <div className="scroll-slim max-h-[70vh] overflow-y-auto px-5 py-4 max-md:max-h-none max-md:min-h-0 max-md:flex-1 max-md:overscroll-contain max-md:px-4 max-md:py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/70 px-5 py-3.5 max-md:px-4 max-md:pb-[calc(0.875rem+var(--m-safe-bottom))] max-md:[&>*]:flex-1">
            {footer}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

/* ── Contact links ────────────────────────────────────────────── */

/** Clickable mailto: link. Falls back to plain text when there's no address. */
export function MailLink({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={className}>—</span>;
  return (
    <a
      href={`mailto:${value}`}
      className={`text-accent-600 underline-offset-2 transition-colors duration-200 hover:text-accent-700 hover:underline ${className}`}
    >
      {value}
    </a>
  );
}

/**
 * Clickable tel: link. Strips spaces/dashes/parens so the dialled string is
 * valid, and normalises an Indian 10-digit number to +91.
 */
export function PhoneLink({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={className}>—</span>;
  const digits = value.replace(/[^\d+]/g, "");
  const tel = digits.length === 10 ? `+91${digits}` : digits;
  return (
    <a
      href={`tel:${tel}`}
      className={`text-accent-600 underline-offset-2 transition-colors duration-200 hover:text-accent-700 hover:underline ${className}`}
    >
      {value.trim()}
    </a>
  );
}

/* ── Toasts ───────────────────────────────────────────────────── */

type Toast = { id: number; text: string; tone: "success" | "error" | "info" };
const ToastCtx = createContext<{ push: (text: string, tone?: Toast["tone"]) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  const tones: Record<Toast["tone"], string> = {
    success: "border-l-ok",
    error: "border-l-danger",
    info: "border-l-info",
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="m-toasts pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,23rem)] flex-col gap-2 max-lg:bottom-[calc(var(--m-nav-h)+var(--m-safe-bottom)+0.75rem)] max-lg:left-4 max-lg:right-4 max-lg:w-auto"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card pointer-events-auto flex items-start gap-2.5 border-l-[3px] p-3.5 text-[13px] font-medium text-ink shadow-lift ${tones[t.tone]}`}
            style={{ animation: "slide-in-right 0.32s var(--ease-soft) both" }}
          >
            <Icon
              name={t.tone === "error" ? "alert" : t.tone === "info" ? "info" : "check"}
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                t.tone === "error" ? "text-danger" : t.tone === "info" ? "text-info" : "text-ok"
              }`}
            />
            <span className="flex-1 leading-snug">{t.text}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="cursor-pointer text-ink-3 transition-colors hover:text-ink"
              aria-label="Dismiss"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
