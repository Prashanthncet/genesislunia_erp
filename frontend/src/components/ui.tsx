"use client";

/**
 * Genesis ERP — shared UI kit.
 * Design-system primitives with motion: reveal-on-scroll, count-up numbers,
 * press feedback, skeleton loading, toasts. All honour prefers-reduced-motion
 * (CSS guard in globals.css). Icons are inline SVG (no emoji as structural icons).
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type ButtonHTMLAttributes,
} from "react";

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
  print: <><path d="M7 8V3h10v5" /><rect x="3.5" y="8" width="17" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  download: <><path d="M12 3v12" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 20h16" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2h.01" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
};

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

export function Reveal({
  children, delay = 0, className = "", y = 16,
}: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translate3d(0,0,0)" : `translate3d(0,${y}px,0)`,
        transition: `opacity 0.55s var(--ease-out-soft) ${delay}ms, transform 0.55s var(--ease-out-soft) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** Counts up to `value` with ease-out; respects reduced motion (jumps straight). */
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
      const p = Math.min(1, (t - start) / 900);
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

export function PageHeader({
  title, subtitle, actions, icon,
}: { title: string; subtitle?: string; actions?: ReactNode; icon?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
            <Icon name={icon} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children, className = "", hover = false, delay = 0,
}: { children: ReactNode; className?: string; hover?: boolean; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <div className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</div>
    </Reveal>
  );
}

const STAT_TONES: Record<string, { chip: string; glow: string }> = {
  brand: { chip: "bg-brand-50 text-brand-700", glow: "from-brand-500/20" },
  emerald: { chip: "bg-emerald-50 text-emerald-700", glow: "from-emerald-500/20" },
  amber: { chip: "bg-amber-50 text-amber-700", glow: "from-amber-500/20" },
  rose: { chip: "bg-rose-50 text-rose-700", glow: "from-rose-500/20" },
  violet: { chip: "bg-violet-50 text-violet-700", glow: "from-violet-500/20" },
  teal: { chip: "bg-teal-50 text-teal-700", glow: "from-teal-500/20" },
};

export function StatCard({
  label, value, hint, tone = "brand", icon, prefix, suffix, decimals = 0,
}: {
  label: string; value: number | null; hint?: string; tone?: keyof typeof STAT_TONES;
  icon?: string; prefix?: string; suffix?: string; decimals?: number;
}) {
  const t = STAT_TONES[tone] ?? STAT_TONES.brand;
  return (
    <div className="card card-hover group relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-gradient-to-br ${t.glow} to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value === null ? <span className="text-slate-300">—</span> : <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />}
          </p>
          {hint && <p className="mt-1 truncate text-xs text-slate-400">{hint}</p>}
        </div>
        {icon && (
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${t.chip}`}>
            <Icon name={icon} />
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "soft" | "danger";
  loading?: boolean;
};

export function Button({ variant = "soft", loading, className = "", children, disabled, ...rest }: BtnProps) {
  const v = { primary: "btn-primary", accent: "btn-accent", soft: "btn-soft", danger: "btn-danger" }[variant];
  return (
    <button className={`${v} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
}

export const Badge = ({
  tone = "slate", children, className = "",
}: {
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky" | "violet" | "brand" | "teal";
  children: ReactNode; className?: string;
}) => {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    brand: "bg-brand-50 text-brand-700",
    teal: "bg-teal-50 text-teal-700",
  };
  return <span className={`badge ${tones[tone]} ${className}`}>{children}</span>;
};

export function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
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

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton ${className}`} aria-hidden />
);

export function EmptyState({ title, hint, icon = "spark", action }: {
  title: string; hint?: string; icon?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name={icon} />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, tone = "brand", className = "" }: {
  value: number; tone?: "brand" | "emerald" | "rose" | "amber"; className?: string;
}) {
  const colors = { brand: "bg-brand-500", emerald: "bg-emerald-500", rose: "bg-rose-500", amber: "bg-amber-500" };
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${className}`} role="progressbar"
      aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full origin-left rounded-full ${colors[tone]} transition-transform duration-700 ease-out`}
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, value / 100))})` }}
      />
    </div>
  );
}

/* ── Segmented tabs ───────────────────────────────────────────── */

/** Animated segmented control: the active pill slides in with a spring. */
export function Tabs<T extends string>({
  tabs, value, onChange, className = "",
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="tablist">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative isolate overflow-hidden rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-all duration-300 ${
              active
                ? "text-white shadow-lift"
                : "border border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-brand-200 hover:text-brand-700 hover:shadow-soft"
            }`}
          >
            {active && (
              <span
                className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800"
                style={{ animation: "fade-in 0.3s var(--ease-out-soft) both", backgroundSize: "200% 100%", animationName: "fade-in, gradient-pan", animationDuration: "0.3s, 14s", animationIterationCount: "1, infinite", animationTimingFunction: "ease-out, ease" }}
              />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Contact links ────────────────────────────────────────────── */

/** Clickable mailto: link. Falls back to plain text when there's no address. */
export function MailLink({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={className}>—</span>;
  return (
    <a href={`mailto:${value}`} className={`text-brand-600 underline-offset-2 transition-colors duration-200 hover:text-brand-800 hover:underline ${className}`}>
      {value}
    </a>
  );
}

/**
 * Clickable tel: link. Strips spaces/dashes/parens so the dialled string is valid,
 * and normalises an Indian 10-digit number to +91 so it works from any phone.
 */
export function PhoneLink({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={className}>—</span>;
  const tel = value.replace(/[^\d+]/g, "");
  const display = value.trim();
  return (
    <a href={`tel:${tel}`} className={`text-brand-600 underline-offset-2 transition-colors duration-200 hover:text-brand-800 hover:underline ${className}`}>
      {display}
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
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
        aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card pointer-events-auto flex items-start gap-2.5 p-3.5 text-sm font-medium ${
              t.tone === "error" ? "border-rose-200 text-rose-700" : t.tone === "info" ? "border-sky-200 text-sky-700" : "border-emerald-200 text-emerald-700"
            }`}
            style={{ animation: "slide-right 0.35s var(--ease-out-soft) both" }}
          >
            <Icon name={t.tone === "error" ? "alert" : "check"} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="cursor-pointer text-slate-400 hover:text-slate-600" aria-label="Dismiss">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}