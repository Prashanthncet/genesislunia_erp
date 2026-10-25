"use client";

/**
 * Geometric layer for /landing: line-art SVG shapes (rings, triangles, hexagons, plus
 * signs, squares, dot grids, cubes, zig-zags) that drift, spin and — in the hero — follow
 * the pointer with depth parallax. Purely decorative: aria-hidden, pointer-events none,
 * and still under prefers-reduced-motion.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { Icon } from "@/components/ui";

type Kind = "ring" | "dashRing" | "triangle" | "triFill" | "square" | "hex" | "plus" | "dots" | "half" | "zigzag" | "cube" | "diamond";

function Shape({ kind, color, size }: { kind: Kind; color: string; size: number }) {
  const s = { width: size, height: size };
  const sw = 2;
  switch (kind) {
    case "ring": return <svg viewBox="0 0 100 100" style={s}><circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth={sw * 2} /></svg>;
    case "dashRing": return <svg viewBox="0 0 100 100" style={s}><circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth={sw * 1.5} strokeDasharray="6 9" strokeLinecap="round" /></svg>;
    case "triangle": return <svg viewBox="0 0 100 100" style={s}><path d="M50 8 94 88H6Z" fill="none" stroke={color} strokeWidth={sw * 2.2} strokeLinejoin="round" /></svg>;
    case "triFill": return <svg viewBox="0 0 100 100" style={s}><defs><linearGradient id={`tg-${color}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={color} stopOpacity=".9" /><stop offset="1" stopColor={color} stopOpacity=".15" /></linearGradient></defs><path d="M50 8 94 88H6Z" fill={`url(#tg-${color})`} /></svg>;
    case "square": return <svg viewBox="0 0 100 100" style={s}><rect x="14" y="14" width="72" height="72" rx="10" fill="none" stroke={color} strokeWidth={sw * 2.2} /></svg>;
    case "diamond": return <svg viewBox="0 0 100 100" style={s}><rect x="22" y="22" width="56" height="56" rx="6" transform="rotate(45 50 50)" fill={color} fillOpacity=".18" stroke={color} strokeWidth={sw * 1.6} /></svg>;
    case "hex": return <svg viewBox="0 0 100 100" style={s}><path d="M50 5 89 27.5v45L50 95 11 72.5v-45Z" fill="none" stroke={color} strokeWidth={sw * 2} strokeLinejoin="round" /></svg>;
    case "plus": return <svg viewBox="0 0 100 100" style={s}><path d="M50 14v72M14 50h72" stroke={color} strokeWidth={sw * 6} strokeLinecap="round" /></svg>;
    case "dots": return <svg viewBox="0 0 100 100" style={s}>{[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => <circle key={`${r}${c}`} cx={14 + c * 24} cy={14 + r * 24} r="4.5" fill={color} />))}</svg>;
    case "half": return <svg viewBox="0 0 100 100" style={s}><path d="M8 60a42 42 0 0 1 84 0Z" fill={color} fillOpacity=".2" stroke={color} strokeWidth={sw * 1.6} /></svg>;
    case "zigzag": return <svg viewBox="0 0 100 40" style={{ width: size, height: size * 0.4 }}><path d="M4 30 18 10l14 20 14-20 14 20 14-20 14 20 8-12" fill="none" stroke={color} strokeWidth={sw * 2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "cube": return (
      <svg viewBox="0 0 100 100" style={s}>
        <path d="M50 8 88 30 50 52 12 30Z" fill={color} fillOpacity=".35" />
        <path d="M12 30 50 52v40L12 70Z" fill={color} fillOpacity=".18" />
        <path d="M88 30 50 52v40l38-22Z" fill={color} fillOpacity=".55" />
      </svg>
    );
  }
}

export type GeoSpec = {
  kind: Kind; color: string; size: number;
  /** absolute placement, e.g. "left-[6%] top-[18%]" */
  at: string;
  spin?: number; // seconds per turn (0 = no spin)
  bob?: number; // seconds per float cycle
  depth?: number; // pointer parallax strength (hero only)
  opacity?: number;
  hideMobile?: boolean;
};

function Geo({ g, mx, my }: { g: GeoSpec; mx?: MotionValue<number>; my?: MotionValue<number> }) {
  const zero = useMotionValue(0);
  const x = useTransform(mx ?? zero, (v) => v * (g.depth ?? 0));
  const y = useTransform(my ?? zero, (v) => v * (g.depth ?? 0));
  const style = { "--spin": `${g.spin ?? 0}s`, "--bob": `${g.bob ?? 9}s`, opacity: g.opacity ?? 0.5 } as CSSProperties;
  return (
    <motion.div className={`absolute ${g.at} ${g.hideMobile ? "max-md:hidden" : ""}`} style={{ x, y }}>
      <div className="lp-bob" style={style}>
        <div className={g.spin ? "lp-spin" : ""} style={style}>
          <Shape kind={g.kind} color={g.color} size={g.size} />
        </div>
      </div>
    </motion.div>
  );
}

/** Scatter of shapes for a section background. */
export function GeoField({ shapes, pointer = false }: { shapes: GeoSpec[]; pointer?: boolean }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  useEffect(() => {
    if (!pointer) return;
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [pointer, mx, my]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {shapes.map((g, k) => <Geo key={k} g={g} mx={pointer ? sx : undefined} my={pointer ? sy : undefined} />)}
    </div>
  );
}

/** Concentric orbit rings with travelling dots — sits behind the hero mockup. */
export function Orbits() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 max-md:h-[520px] max-md:w-[520px]">
      {[1, 0.74, 0.5].map((r, k) => (
        <div key={r} className="lp-orbit absolute rounded-full border border-white/[0.09]" style={{ inset: `${(1 - r) * 50}%`, "--orbit": `${30 + k * 14}s`, animationDirection: k % 2 ? "reverse" : "normal" } as CSSProperties}>
          <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_18px_4px_rgba(125,211,252,0.7)]" />
          {k === 1 && <span className="absolute -bottom-1 left-[20%] h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_3px_rgba(252,211,77,0.7)]" />}
        </div>
      ))}
    </div>
  );
}

/* Presets */
export const HERO_SHAPES: GeoSpec[] = [
  { kind: "triangle", color: "#60a5fa", size: 70, at: "left-[1%] top-[9%]", spin: 40, bob: 9, depth: 18, opacity: 0.55 },
  { kind: "hex", color: "#5eead4", size: 54, at: "left-[42%] top-[12%]", spin: 30, bob: 11, depth: -14, opacity: 0.5, hideMobile: true },
  { kind: "plus", color: "#fcd34d", size: 30, at: "left-[2%] bottom-[6%]", spin: 22, bob: 7, depth: 24, opacity: 0.7 },
  { kind: "ring", color: "#a78bfa", size: 40, at: "right-[6%] bottom-[12%]", bob: 10, depth: -20, opacity: 0.55 },
  { kind: "dots", color: "#93c5fd", size: 64, at: "right-[3%] top-[18%]", bob: 13, depth: 12, opacity: 0.35, hideMobile: true },
  { kind: "cube", color: "#3b82f6", size: 58, at: "left-[46%] bottom-[10%]", spin: 0, bob: 8, depth: -26, opacity: 0.8, hideMobile: true },
  { kind: "diamond", color: "#5eead4", size: 34, at: "right-[44%] top-[34%]", spin: 18, bob: 9, depth: 30, opacity: 0.6, hideMobile: true },
  { kind: "zigzag", color: "#f472b6", size: 64, at: "left-[30%] bottom-[6%]", bob: 12, depth: 16, opacity: 0.45, hideMobile: true },
];

export const LIGHT_SHAPES: GeoSpec[] = [
  { kind: "ring", color: "#3b82f6", size: 120, at: "-left-10 top-24", bob: 14, opacity: 0.12 },
  { kind: "triangle", color: "#0d9488", size: 64, at: "right-[6%] top-16", spin: 50, bob: 10, opacity: 0.2 },
  { kind: "dots", color: "#1e3a8a", size: 90, at: "right-[3%] bottom-24", bob: 16, opacity: 0.13 },
  { kind: "plus", color: "#f59e0b", size: 26, at: "left-[8%] bottom-16", spin: 24, bob: 8, opacity: 0.4 },
  { kind: "hex", color: "#6366f1", size: 48, at: "left-[46%] top-8", spin: 36, bob: 12, opacity: 0.15, hideMobile: true },
];

export const DARK_SHAPES: GeoSpec[] = [
  { kind: "hex", color: "#5eead4", size: 140, at: "-right-12 top-10", spin: 60, bob: 16, opacity: 0.18 },
  { kind: "dashRing", color: "#93c5fd", size: 180, at: "-left-16 bottom-0", spin: 70, bob: 18, opacity: 0.25 },
  { kind: "triangle", color: "#fcd34d", size: 46, at: "left-[12%] top-[18%]", spin: 30, bob: 9, opacity: 0.45 },
  { kind: "plus", color: "#a78bfa", size: 24, at: "right-[16%] bottom-[14%]", spin: 20, bob: 7, opacity: 0.6 },
  { kind: "square", color: "#60a5fa", size: 40, at: "right-[30%] top-[8%]", spin: 26, bob: 11, opacity: 0.35, hideMobile: true },
];

export const CTA_SHAPES: GeoSpec[] = [
  { kind: "cube", color: "#60a5fa", size: 72, at: "left-[6%] top-[14%]", bob: 9, opacity: 0.85 },
  { kind: "ring", color: "#fcd34d", size: 54, at: "right-[8%] top-[16%]", bob: 11, opacity: 0.6 },
  { kind: "triFill", color: "#5eead4", size: 52, at: "right-[14%] bottom-[12%]", spin: 34, bob: 10, opacity: 0.7 },
  { kind: "dots", color: "#93c5fd", size: 70, at: "left-[10%] bottom-[10%]", bob: 14, opacity: 0.35 },
  { kind: "plus", color: "#f472b6", size: 26, at: "left-[30%] top-[10%]", spin: 22, bob: 8, opacity: 0.7, hideMobile: true },
];

/* ── Footer ─────────────────────────────────────────────────────────────── */

const COLS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["Features", "#features"], ["How it flows", "#flow"], ["Mobile app", "#mobile"], ["Security", "#trust"]] },
  { title: "For", links: [["Principals", "#roles"], ["Teachers", "#roles"], ["Wardens & security", "#roles"], ["Parents & students", "#roles"]] },
  { title: "Modules", links: [["Attendance", "#features"], ["Fees & receipts", "#features"], ["Gate desk", "#features"], ["Exams & report cards", "#features"]] },
  { title: "Help", links: [["FAQ", "#faq"], ["Sign in", "/login"]] },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#050f22] text-white">
      {/* geometry + glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-accent-500/20 blur-[120px]" />
        <div className="lp-grid absolute inset-0 opacity-40" />
      </div>
      <GeoField shapes={[
        { kind: "hex", color: "#5eead4", size: 120, at: "-left-10 top-16", spin: 60, bob: 16, opacity: 0.14 },
        { kind: "ring", color: "#60a5fa", size: 70, at: "right-[8%] top-10", bob: 12, opacity: 0.25 },
        { kind: "triangle", color: "#fcd34d", size: 40, at: "right-[24%] bottom-[38%]", spin: 30, bob: 9, opacity: 0.35, hideMobile: true },
        { kind: "plus", color: "#a78bfa", size: 22, at: "left-[38%] top-14", spin: 20, bob: 7, opacity: 0.5, hideMobile: true },
      ]} />

      <div className="relative mx-auto max-w-7xl px-5 pt-20 sm:px-8">
        {/* top: brand + statement */}
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <a href="#top" className="inline-flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg"><Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" /></span>
              <span>
                <span className="block font-display text-[20px] font-extrabold tracking-tight">Genesis Lumia</span>
                <span className="block text-[12.5px] font-medium uppercase tracking-[0.18em] text-white/50">School ERP</span>
              </span>
            </a>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/60">
              One calm, connected system for admissions, attendance, timetable, exams, fees, hostel, the gate desk and payroll — on every screen.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {[["shield", "Role-based access"], ["phone", "Mobile-first"], ["lock", "Audit-logged"]].map(([ic, t]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/70">
                  <Icon name={ic} className="h-3.5 w-3.5 text-sky-300" />{t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLS.map((c) => (
              <div key={c.title}>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/40">{c.title}</p>
                <ul className="mt-4 space-y-3">
                  {c.links.map(([l, h]) => (
                    <li key={l}>
                      {h.startsWith("/")
                        ? <Link href={h} className="lp-flink text-[14.5px] text-white/75 transition-colors hover:text-white">{l}</Link>
                        : <a href={h} className="lp-flink text-[14.5px] text-white/75 transition-colors hover:text-white">{l}</a>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* CTA strip */}
        <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-gradient-to-r from-white/[0.07] to-white/[0.02] p-6 backdrop-blur sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="font-display text-[22px] font-bold tracking-tight sm:text-[26px]">Ready when your school is.</p>
            <p className="mt-1 text-[14.5px] text-white/60">Sign in to explore every module with your school's demo data.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="lp-shine relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-accent-500 to-sky-400 px-7 text-[15px] font-bold text-white shadow-[0_12px_40px_-8px_rgba(59,130,246,0.7)]">
              Sign in <Icon name="arrowUpRight" className="h-4 w-4" />
            </Link>
            <a href="#top" aria-label="Back to top" className="grid h-12 w-12 place-items-center rounded-full border border-white/15 text-white/80 transition-colors hover:bg-white/10">
              <Icon name="chevronDown" className="h-5 w-5 rotate-180" />
            </a>
          </div>
        </div>

        {/* giant wordmark */}
        <div aria-hidden className="relative mt-16 select-none overflow-hidden">
          <p className="lp-wordmark text-center font-display font-extrabold leading-[0.8] tracking-[-0.06em]">GENESIS</p>
        </div>

        {/* bottom bar */}
        <div className="relative flex flex-col items-center justify-between gap-3 border-t border-white/10 py-7 text-[13px] text-white/45 sm:flex-row">
          <p>© {new Date().getFullYear()} Genesis Lumia · School ERP</p>
          <p className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />All systems designed for every screen</p>
        </div>
      </div>
    </footer>
  );
}
