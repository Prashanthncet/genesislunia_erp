"use client";

/**
 * /landing — redesigned "Everything connected", "Safe by design" and FAQ sections.
 * Previews are illustrative UI built from the product's real screens (no real records).
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Icon } from "@/components/ui";
import { GeoField } from "./shapes";

const EASE = [0.22, 1, 0.36, 1] as const;

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold tracking-wide ${dark ? "bg-white/10 text-sky-200 ring-1 ring-white/15" : "bg-accent-50 text-accent-700 ring-1 ring-accent-500/15"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-sky-300" : "bg-accent-500"}`} />
      {children}
    </span>
  );
}

/* ═══════════════════════ 1. EVERYTHING CONNECTED ═══════════════════════ */

type Mod = { id: string; icon: string; label: string; tag: string; title: string; body: string; color: string; bg: string };
const MODS: Mod[] = [
  { id: "attendance", icon: "attendance", label: "Attendance", tag: "Daily", title: "A whole class marked in seconds", body: "Present, Absent, Late, On Duty or Leave in one tap per student. Absences reach parents automatically; approved leave is pre-filled.", color: "#059669", bg: "from-emerald-500/20" },
  { id: "gate", icon: "door", label: "Gate desk", tag: "Safety", title: "No child leaves without the parent's code", body: "Warden → Principal approval, then security verifies a one-time code sent to the parent. Late returns are flagged on their own.", color: "#0284c7", bg: "from-sky-500/20" },
  { id: "fees", icon: "fees", label: "Fees", tag: "Finance", title: "Fees that collect themselves", body: "Invoices go out, parents pay online, receipts arrive instantly and the defaulter list updates without anyone touching a spreadsheet.", color: "#d97706", bg: "from-amber-500/20" },
  { id: "timetable", icon: "timetable", label: "Timetable", tag: "Planning", title: "A week that builds itself", body: "Auto-generate the timetable, see who's free and assign a substitute for an absent teacher in two taps.", color: "#7c3aed", bg: "from-violet-500/20" },
  { id: "exams", icon: "exams", label: "Exams & CBT", tag: "Learning", title: "From marks to report cards in one publish", body: "Marks entry, online tests with a grading queue and beautifully formatted report-card PDFs.", color: "#e11d48", bg: "from-rose-500/20" },
  { id: "hostel", icon: "hostel", label: "Hostel", tag: "Boarding", title: "Every boarder, every night", body: "Rooms and beds at a glance, morning and night roll call with one save — gate passes and leave already accounted for.", color: "#0d9488", bg: "from-teal-500/20" },
  { id: "payroll", icon: "staff", label: "Payroll", tag: "People", title: "Payslips with every deduction right", body: "Salary structures with TDS, PT and EPF, payroll runs as drafts, released to staff with one click.", color: "#4f46e5", bg: "from-indigo-500/20" },
  { id: "safeguarding", icon: "discipline", label: "Safeguarding", tag: "Care", title: "Every concern, handled with care", body: "Incidents with severity, owner, escalation and private case notes — every step on a permanent audit trail.", color: "#ea580c", bg: "from-orange-500/20" },
];

function Win({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/70 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[12px] font-semibold text-ink-3">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function useTick(ms: number, n: number) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % n), ms); return () => clearInterval(t); }, [ms, n]);
  return i;
}

function PreviewAttendance() {
  const step = useTick(700, 13);
  const rows = ["Aarav Bose", "Priya Menon", "Rahul Verma", "Ananya Banerjee", "Arjun Nair"];
  const status = ["P", "P", "A", "P", "OD"];
  return (
    <Win title="Mark attendance · Class 10 A">
      <div className="space-y-2">
        {rows.map((n, k) => {
          const done = step > k * 2;
          const s = status[k];
          return (
            <div key={n} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white">{n.split(" ").map((w) => w[0]).join("")}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{n}</span>
              <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
                {["P", "A", "L", "OD"].map((x) => {
                  const on = done && x === s;
                  return <motion.span key={x} animate={{ scale: on ? 1.06 : 1 }} className={`grid h-7 min-w-8 place-items-center rounded-md px-1.5 text-[11px] font-bold transition-colors ${on ? (x === "P" ? "bg-emerald-600 text-white" : x === "A" ? "bg-rose-600 text-white" : "bg-sky-600 text-white") : "text-ink-3"}`}>{x}</motion.span>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-700 px-4 py-3 text-white">
        <span className="text-[12.5px]">{Math.min(5, Math.floor(step / 2))} of 5 marked · 1 absence notice queued</span>
        <span className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-bold">Save</span>
      </div>
    </Win>
  );
}

function PreviewGate() {
  const step = useTick(1100, 6);
  const stages = [["Requested", "user"], ["Warden", "hostel"], ["Principal", "building"], ["Parent OTP", "key"], ["Checked out", "door"]];
  return (
    <Win title="Gate pass GP-1043 · Aarav Bose">
      <div className="flex items-center justify-between">
        {stages.map(([l, ic], k) => (
          <div key={l} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <motion.span animate={{ scale: step === k ? 1.12 : 1 }} className={`grid h-10 w-10 place-items-center rounded-full ring-4 transition-colors ${step >= k ? "bg-sky-600 text-white ring-sky-100" : "bg-surface-2 text-ink-3 ring-transparent"}`}><Icon name={step > k ? "check" : ic} className="h-4.5 w-4.5" /></motion.span>
              <span className={`text-[10.5px] font-semibold ${step >= k ? "text-ink" : "text-ink-3"}`}>{l}</span>
            </div>
            {k < stages.length - 1 && <div className="mx-1 mb-5 h-0.5 flex-1 overflow-hidden rounded bg-line"><motion.div className="h-full bg-sky-600" animate={{ width: step > k ? "100%" : "0%" }} transition={{ duration: 0.5 }} /></div>}
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-sky-700">Parent code</p>
        <div className="mt-2 flex justify-center gap-1.5">
          {"482916".split("").map((d, k) => (
            <motion.span key={k} animate={{ opacity: step >= 3 ? 1 : 0.25, y: step >= 3 ? 0 : 4 }} transition={{ delay: step >= 3 ? k * 0.05 : 0 }} className="grid h-11 w-9 place-items-center rounded-lg bg-white font-mono text-[19px] font-bold text-brand-700 shadow-sm ring-1 ring-sky-100">{d}</motion.span>
          ))}
        </div>
      </div>
    </Win>
  );
}

function PreviewFees() {
  const step = useTick(1300, 4);
  const paid = step >= 2;
  return (
    <Win title="Invoice INV-2026-0488">
      <div className="flex items-start justify-between">
        <div><p className="text-[12px] text-ink-3">Term 2 · Class 11 Science</p><p className="mt-1 font-display text-[30px] font-extrabold text-ink">₹12,875</p></div>
        <AnimatePresence mode="wait">
          <motion.span key={paid ? "p" : "u"} initial={{ scale: 1.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: paid ? -8 : 0 }} exit={{ opacity: 0 }} className={`rounded-lg border-2 px-3 py-1 text-[13px] font-extrabold uppercase tracking-wider ${paid ? "border-emerald-600 text-emerald-600" : "border-amber-500 text-amber-600"}`}>{paid ? "Paid" : "Due"}</motion.span>
        </AnimatePresence>
      </div>
      <div className="mt-4 space-y-2 text-[13px]">
        {[["Tuition", "₹10,500"], ["Lab & activities", "₹1,500"], ["Transport", "₹875"]].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-dashed border-line pb-2"><span className="text-ink-2">{k}</span><span className="font-semibold text-ink">{v}</span></div>
        ))}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" animate={{ width: paid ? "100%" : step === 1 ? "55%" : "8%" }} transition={{ duration: 0.9, ease: EASE }} /></div>
      <div className={`mt-4 flex items-center gap-3 rounded-xl p-3 transition-colors ${step >= 3 ? "bg-emerald-50" : "bg-surface-2"}`}>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${step >= 3 ? "bg-emerald-600 text-white" : "bg-white text-ink-3"}`}><Icon name="receipt" className="h-4.5 w-4.5" /></span>
        <span className="text-[13px] font-semibold text-ink">{step >= 3 ? "Receipt RC-2026-0201 sent to parent" : "Waiting for payment…"}</span>
      </div>
    </Win>
  );
}

function PreviewTimetable() {
  const step = useTick(500, 22);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const colors = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-400", "bg-rose-500", "bg-indigo-500"];
  return (
    <Win title="Timetable · Class 10 A">
      <div className="grid grid-cols-5 gap-1.5">
        {days.map((d) => <p key={d} className="text-center text-[11px] font-bold uppercase text-ink-3">{d}</p>)}
        {Array.from({ length: 20 }, (_, k) => (
          <motion.span key={k} initial={false} animate={{ opacity: step > k ? 1 : 0.15, scale: step > k ? 1 : 0.85 }} className={`h-9 rounded-lg ${k === 11 && step > 18 ? "bg-amber-400 ring-2 ring-amber-200" : colors[(k * 7) % colors.length]}`} />
        ))}
      </div>
      <AnimatePresence>{step > 18 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 p-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 text-white"><Icon name="user" className="h-4.5 w-4.5" /></span>
          <span className="text-[13px] font-semibold text-ink">Wed P3 · Ms. Rao assigned as substitute</span>
        </motion.div>
      )}</AnimatePresence>
    </Win>
  );
}

function PreviewExams() {
  const subj = [["Mathematics", 92], ["Science", 88], ["English", 81], ["Social", 86], ["Hindi", 79]] as const;
  return (
    <Win title="Report card · Term 1">
      <div className="space-y-3">
        {subj.map(([s, m], k) => (
          <div key={s}>
            <div className="flex justify-between text-[12.5px]"><span className="font-semibold text-ink">{s}</span><span className="tabular-nums text-ink-2">{m}/100</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-400" initial={{ width: 0 }} animate={{ width: `${m}%` }} transition={{ delay: k * 0.12, duration: 0.9, ease: EASE }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-rose-50 p-3">
        <span className="text-[13px] font-semibold text-ink">Overall 85.2% · Grade A1</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-rose-700 ring-1 ring-rose-100"><Icon name="download" className="h-3.5 w-3.5" /> PDF</span>
      </div>
    </Win>
  );
}

function PreviewHostel() {
  const step = useTick(900, 5);
  return (
    <Win title="Roll call · Night · Subhash Chandra Bose House">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, r) => (
          <div key={r} className="rounded-xl border border-line p-2.5">
            <p className="text-[11px] font-bold text-teal-700">J-10{r + 1}</p>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {Array.from({ length: 4 }, (_, b) => {
                const filled = step > (r + b) % 5;
                const leave = r === 1 && b === 2;
                return <motion.span key={b} animate={{ scale: filled ? 1 : 0.7 }} className={`h-4 rounded ${!filled ? "bg-line" : leave ? "bg-amber-400" : "bg-teal-500"}`} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["23", "Present", "text-emerald-600 bg-emerald-50"], ["0", "Absent", "text-rose-600 bg-rose-50"], ["1", "On leave", "text-amber-600 bg-amber-50"]].map(([n, l, c]) => (
          <div key={l} className={`rounded-xl p-2.5 ${c}`}><p className="font-display text-[20px] font-extrabold">{n}</p><p className="text-[11px] font-semibold">{l}</p></div>
        ))}
      </div>
    </Win>
  );
}

function PreviewPayroll() {
  return (
    <Win title="Payslip · October 2026">
      <div className="flex items-end justify-between rounded-xl bg-indigo-50 p-4">
        <div><p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Net pay</p><p className="font-display text-[30px] font-extrabold text-indigo-700">₹73,081</p></div>
        <div className="text-right"><p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Gross</p><p className="text-[16px] font-bold text-ink">₹83,875</p></div>
      </div>
      <div className="mt-4 space-y-2.5">
        {[["Income tax (TDS)", 4194, 10794], ["Provident fund (EPF)", 6600, 10794], ["Professional tax", 200, 10794]].map(([l, v, t], k) => (
          <div key={l as string}>
            <div className="flex justify-between text-[12.5px]"><span className="text-ink-2">{l}</span><span className="font-semibold tabular-nums text-ink">₹{(v as number).toLocaleString("en-IN")}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-indigo-500" initial={{ width: 0 }} animate={{ width: `${((v as number) / (t as number)) * 100}%` }} transition={{ delay: k * 0.15, duration: 0.8, ease: EASE }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2"><span className="grid h-10 place-items-center rounded-xl bg-brand-700 text-[12.5px] font-bold text-white">Mark paid</span><span className="grid h-10 place-items-center rounded-xl text-[12.5px] font-bold text-ink ring-1 ring-line">PDF</span></div>
    </Win>
  );
}

function PreviewSafeguarding() {
  const step = useTick(1000, 5);
  const steps = [["Reported", "Class teacher · 09:12"], ["Owner assigned", "Discipline officer"], ["Escalated", "Principal notified"], ["Resolved", "Case notes kept private"]];
  return (
    <Win title="Incident · Confidential">
      <div className="relative space-y-4 pl-7">
        <span className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-line" />
        {steps.map(([t, s], k) => (
          <motion.div key={t} animate={{ opacity: step >= k ? 1 : 0.35 }} className="relative">
            <span className={`absolute -left-7 top-0.5 grid h-6 w-6 place-items-center rounded-full ring-4 ring-white transition-colors ${step > k ? "bg-orange-500 text-white" : step === k ? "bg-orange-100 text-orange-600" : "bg-surface-2 text-ink-3"}`}><Icon name={step > k ? "check" : "clock"} className="h-3.5 w-3.5" /></span>
            <p className="text-[13.5px] font-bold text-ink">{t}</p>
            <p className="text-[12px] text-ink-3">{s}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-orange-50 p-3 text-[12.5px] font-semibold text-orange-800"><Icon name="lock" className="h-4 w-4" /> Every step recorded on the audit trail</div>
    </Win>
  );
}

const PREVIEW: Record<string, () => ReactNode> = {
  attendance: () => <PreviewAttendance />, gate: () => <PreviewGate />, fees: () => <PreviewFees />, timetable: () => <PreviewTimetable />,
  exams: () => <PreviewExams />, hostel: () => <PreviewHostel />, payroll: () => <PreviewPayroll />, safeguarding: () => <PreviewSafeguarding />,
};

/** Hub-and-spoke system map: Genesis core + 8 modules, data pulses on every link. */
function SystemMap({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  // ellipse layout in a 1000 x 420 box
  const pts = MODS.map((_, k) => {
    const a = (k / MODS.length) * Math.PI * 2 - Math.PI / 2;
    return { x: 500 + Math.cos(a) * 400, y: 210 + Math.sin(a) * 160 };
  });
  return (
    <div className="relative mx-auto mt-14 aspect-[1000/420] w-full max-w-5xl max-md:hidden">
      <svg viewBox="0 0 1000 420" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".35" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="500" cy="210" rx="400" ry="160" fill="none" stroke="rgba(20,43,74,.08)" strokeDasharray="4 8" />
        <circle cx="500" cy="210" r="120" fill="url(#core)" />
        {pts.map((p, k) => (
          <g key={k}>
            <line x1="500" y1="210" x2={p.x} y2={p.y} stroke={k === active ? MODS[k].color : "rgba(20,43,74,.12)"} strokeWidth={k === active ? 2.5 : 1.5} className="transition-all duration-500" />
            <line x1="500" y1="210" x2={p.x} y2={p.y} stroke={MODS[k].color} strokeWidth="3" strokeLinecap="round" strokeDasharray="6 400" className="lp-pulse" style={{ animationDelay: `${k * 0.35}s` }} />
          </g>
        ))}
      </svg>
      {/* core */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative grid h-24 w-24 place-items-center rounded-3xl bg-white shadow-[0_20px_60px_-15px_rgba(59,130,246,0.6)] ring-1 ring-accent-500/20">
          <span className="lp-ping absolute inset-0 rounded-3xl ring-2 ring-accent-500/40" />
          <Image src="/logo.png" alt="" width={56} height={56} className="h-14 w-14 object-contain" />
        </div>
      </div>
      {/* nodes */}
      {pts.map((p, k) => {
        const m = MODS[k];
        const on = k === active;
        return (
          <button key={m.id} type="button" onMouseEnter={() => onPick(k)} onFocus={() => onPick(k)} onClick={() => onPick(k)}
            className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x / 10}%`, top: `${(p.y / 420) * 100}%` }}>
            <motion.span animate={{ scale: on ? 1.12 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-2.5 shadow-sm transition-shadow ${on ? "shadow-[0_14px_40px_-12px_rgba(15,23,42,0.35)]" : ""}`}
              style={{ borderColor: on ? m.color : "rgba(20,43,74,.1)" }}>
              <span className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: m.color }}><Icon name={m.icon} className="h-4 w-4" /></span>
              <span className="text-[13px] font-bold text-ink">{m.label}</span>
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}

export function ConnectedSection() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20%" });
  const DURATION = 6;
  useEffect(() => {
    if (paused || !inView) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % MODS.length), DURATION * 1000);
    return () => clearTimeout(t);
  }, [active, paused, inView]);
  const m = MODS[active];
  const pick = (i: number) => { setActive(i); setPaused(true); };

  return (
    <section id="features" className="relative scroll-mt-20 overflow-hidden bg-[#f5f7fc] py-24 sm:py-32">
      <div aria-hidden className="lp-dots absolute inset-0 opacity-50" />
      <GeoField shapes={[
        { kind: "dashRing", color: "#3b82f6", size: 220, at: "-left-24 top-16", spin: 80, bob: 16, opacity: 0.16 },
        { kind: "hex", color: "#0d9488", size: 70, at: "right-[5%] top-24", spin: 40, bob: 12, opacity: 0.2 },
        { kind: "triangle", color: "#f59e0b", size: 48, at: "left-[8%] bottom-[14%]", spin: 34, bob: 10, opacity: 0.3 },
        { kind: "dots", color: "#1e3a8a", size: 90, at: "right-[3%] bottom-[10%]", bob: 15, opacity: 0.13 },
      ]} />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }} className="mx-auto max-w-3xl text-center">
          <Eyebrow>Everything connected</Eyebrow>
          <h2 className="mt-5 text-balance font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
            One core. <span className="lp-gradient-text-dark">Every corner of the school.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">Eight modules share one source of truth — a gate pass knows about leave, roll call knows about the gate, and parents hear about all of it.</p>
        </motion.div>

        <SystemMap active={active} onPick={pick} />

        {/* explorer */}
        <div ref={ref} className="mt-14 grid grid-cols-1 gap-8 lg:mt-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center" onMouseLeave={() => setPaused(false)}>
          <div>
            {/* phones: chip scroller */}
            <div className="m-scroll-x -mx-5 flex gap-2 px-5 pb-1 lg:hidden">
              {MODS.map((x, k) => (
                <button key={x.id} type="button" onClick={() => pick(k)} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${k === active ? "text-white" : "bg-white text-ink-2 ring-1 ring-line"}`} style={k === active ? { background: x.color } : undefined}>
                  <Icon name={x.icon} className="h-4 w-4" />{x.label}
                </button>
              ))}
            </div>
            {/* desktop: list with progress */}
            <ul className="hidden space-y-1.5 lg:block">
              {MODS.map((x, k) => {
                const on = k === active;
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => pick(k)} className={`group relative w-full overflow-hidden rounded-2xl px-5 py-4 text-left transition-colors ${on ? "bg-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)] ring-1 ring-line" : "hover:bg-white/60"}`}>
                      <div className="flex items-center gap-4">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors" style={{ background: on ? x.color : "rgba(20,43,74,.06)", color: on ? "#fff" : x.color }}><Icon name={x.icon} className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-[15.5px] font-bold text-ink">{x.label}<span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ background: `${x.color}14`, color: x.color }}>{x.tag}</span></p>
                          <AnimatePresence initial={false}>
                            {on && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden pt-1 text-[14px] leading-relaxed text-ink-2">{x.body}</motion.p>}
                          </AnimatePresence>
                        </div>
                      </div>
                      {on && !paused && <motion.span key={`bar-${active}`} className="absolute bottom-0 left-0 h-[3px] rounded-full" style={{ background: x.color }} initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: DURATION, ease: "linear" }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* preview */}
          <div className="relative">
            <div aria-hidden className={`absolute -inset-6 rounded-[40px] bg-gradient-to-br ${m.bg} to-transparent blur-2xl transition-all duration-700`} />
            <AnimatePresence mode="wait">
              <motion.div key={m.id} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={{ duration: 0.5, ease: EASE }} className="relative">
                <div className="mb-4 lg:hidden">
                  <h3 className="font-display text-[22px] font-extrabold tracking-tight text-ink">{m.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{m.body}</p>
                </div>
                <p className="mb-3 hidden font-display text-[24px] font-extrabold tracking-tight text-ink lg:block">{m.title}</p>
                {PREVIEW[m.id]()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ 2. SAFE BY DESIGN ═══════════════════════════ */

export const PILLARS = [
  { icon: "lock", title: "Role-based access", body: "Sixteen roles, each sees only what it should. Parents see only their own children." },
  { icon: "clipboard", title: "Complete audit trail", body: "Approvals, payments and record changes are logged with who did it and when." },
  { icon: "shield", title: "Confirm before change", body: "Every update and delete asks first — no accidental clicks, no silent edits." },
  { icon: "building", title: "Campus isolation", body: "Each school's data is kept strictly separate from every other school's." },
];

const LOG = [
  ["Principal", "approved gate pass GP-1043", "bg-sky-400/15 text-sky-300"],
  ["Accounts", "recorded payment RC-2026-0201", "bg-amber-400/15 text-amber-300"],
  ["Teacher", "saved attendance · Class 10 A", "bg-emerald-400/15 text-emerald-300"],
  ["Security", "verified parent code · checked out", "bg-violet-400/15 text-violet-300"],
  ["Warden", "saved night roll call · J Block", "bg-teal-400/15 text-teal-300"],
  ["HR", "released 28 payslips · October", "bg-indigo-400/15 text-indigo-300"],
  ["Admin", "changed role for a staff login", "bg-rose-400/15 text-rose-300"],
  ["Parent", "downloaded fee receipt", "bg-pink-400/15 text-pink-300"],
] as const;

function AuditConsole() {
  const [n, setN] = useState(4);
  useEffect(() => { const t = setInterval(() => setN((x) => x + 1), 1800); return () => clearInterval(t); }, []);
  const rows = Array.from({ length: 5 }, (_, k) => {
    const i = n - k;
    const [who, what, tone] = LOG[((i % LOG.length) + LOG.length) % LOG.length];
    const mins = 10 * 60 + 40 + i;
    return { key: i, who, what, tone, time: `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}` };
  });
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1a33]/80 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/80"><Icon name="clipboard" className="h-4 w-4 text-sky-300" /> Audit trail</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live</span>
      </div>
      <ul className="relative h-[300px] overflow-hidden px-3 py-2">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.li key={r.key} layout initial={{ opacity: 0, y: -24, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}
              className="flex items-center gap-3 rounded-xl px-2.5 py-3">
              <span className="font-mono text-[12px] text-white/40">{r.time}</span>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${r.tone}`}>{r.who}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/85">{r.what}</span>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/20 text-emerald-300"><Icon name="check" className="h-3 w-3" /></span>
            </motion.li>
          ))}
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0a1a33] to-transparent" />
      </ul>
    </div>
  );
}

export function TrustSection() {
  return (
    <section id="trust" className="relative scroll-mt-20 overflow-hidden bg-[#050f22] py-24 text-white sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="lp-grid absolute inset-0 opacity-40" />
        <div className="absolute right-[10%] top-1/2 h-[560px] w-[560px] -translate-y-1/2 rounded-full bg-sky-500/10 blur-[120px]" />
      </div>
      <GeoField shapes={[
        { kind: "hex", color: "#5eead4", size: 120, at: "-left-10 top-12", spin: 60, bob: 16, opacity: 0.16 },
        { kind: "plus", color: "#fcd34d", size: 24, at: "left-[42%] top-14", spin: 20, bob: 8, opacity: 0.5, hideMobile: true },
        { kind: "triangle", color: "#a78bfa", size: 44, at: "left-[6%] bottom-[12%]", spin: 30, bob: 10, opacity: 0.4 },
      ]} />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}>
            <Eyebrow dark>Safe by design</Eyebrow>
            <h2 className="mt-5 text-balance font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[50px]">
              Trust isn&apos;t a feature. <span className="lp-gradient-text">It&apos;s the foundation.</span>
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/65 sm:text-[18px]">A school holds the most sensitive data there is — children&apos;s records, families&apos; money, staff salaries. Every layer is built to protect it.</p>
          </motion.div>
          <div className="mt-10 space-y-3">
            {PILLARS.map((p, k) => (
              <motion.div key={p.title} initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: k * 0.1, duration: 0.6, ease: EASE }}
                className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-sky-300/30 hover:bg-white/[0.06]">
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-400/25 to-indigo-500/25 text-sky-200 ring-1 ring-white/10">
                  <Icon name={p.icon} className="h-5 w-5" />
                  <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 + k * 0.12, type: "spring", stiffness: 400, damping: 15 }} className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-[#050f22] ring-2 ring-[#050f22]"><Icon name="check" className="h-3 w-3" /></motion.span>
                </span>
                <div>
                  <h3 className="text-[16.5px] font-bold">{p.title}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-white/60">{p.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* shield + live console */}
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 max-md:h-[340px] max-md:w-[340px]">
            {[1, 0.75, 0.5].map((r) => <span key={r} className="absolute rounded-full border border-sky-300/10" style={{ inset: `${(1 - r) * 50}%` }} />)}
            <span className="lp-radar absolute inset-0 rounded-full" />
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }}
            className="relative z-10 mx-auto mb-6 grid h-24 w-24 place-items-center rounded-[28px] bg-gradient-to-br from-sky-400 to-indigo-600 shadow-[0_0_60px_-5px_rgba(56,189,248,0.6)]">
            <Icon name="shield" className="h-11 w-11 text-white" />
          </motion.div>
          <div className="relative z-10"><AuditConsole /></div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════ 3. FAQ ═══════════════════════════════ */

export const FAQ = [
  { q: "Does it work on phones?", a: "Yes — it was redesigned phone-first. Teachers mark attendance, wardens run roll call and parents pay fees from their phones, with bottom navigation, full-screen forms and large touch targets." },
  { q: "Who can see what?", a: "Sixteen roles, each with exactly the screens it needs. A warden sees hostel and gate, a parent sees only their own children, and every sensitive action asks for confirmation and is logged." },
  { q: "Can parents pay fees online?", a: "Yes. Parents pay from the portal through the payment gateway, receipts are generated as PDFs immediately, and the school's ledger and defaulter list update on their own." },
  { q: "How are students kept safe at the gate?", a: "Every pass goes Warden → Principal before it's valid. At the gate, security verifies a one-time code sent to the parent before a child can leave, and late returns are flagged automatically." },
  { q: "Can we export our data?", a: "Every list exports to Excel or CSV, and receipts, payslips, report cards and passes are beautifully formatted PDFs." },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative scroll-mt-20 overflow-hidden bg-white py-24 sm:py-32">
      <GeoField shapes={[
        { kind: "ring", color: "#3b82f6", size: 160, at: "-left-16 bottom-10", bob: 16, opacity: 0.1 },
        { kind: "triangle", color: "#0d9488", size: 52, at: "right-[6%] top-16", spin: 44, bob: 11, opacity: 0.22 },
        { kind: "plus", color: "#f59e0b", size: 24, at: "right-[40%] bottom-14", spin: 22, bob: 8, opacity: 0.4, hideMobile: true },
      ]} />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
        {/* sticky intro */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mt-5 font-display text-[40px] font-extrabold leading-[1] tracking-[-0.035em] text-ink sm:text-[60px]">
              Good<br />questions,<br /><span className="lp-gradient-text-dark">clear answers.</span>
            </h2>
            <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-ink-2">Everything schools usually ask before they switch. Can&apos;t find yours? Sign in and explore every module yourself.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15, duration: 0.7, ease: EASE }}
            className="relative mt-8 overflow-hidden rounded-3xl bg-[#071630] p-6 text-white">
            <div aria-hidden className="lp-aurora lp-a1 opacity-60" style={{ width: 300, height: 300, left: -80, top: -120 }} />
            <svg aria-hidden viewBox="0 0 100 100" className="lp-spin absolute -right-6 -top-6 h-32 w-32 text-white/10" style={{ "--spin": "40s" } as CSSProperties}><path d="M50 5 89 27.5v45L50 95 11 72.5v-45Z" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
            <div className="relative">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-sky-200 ring-1 ring-white/15"><Icon name="help" className="h-5 w-5" /></span>
              <p className="mt-4 font-display text-[20px] font-bold">Still curious?</p>
              <p className="mt-1 text-[14px] text-white/65">See it with real demo data for every role.</p>
              <Link href="/login" className="lp-shine relative mt-5 inline-flex h-11 items-center gap-2 overflow-hidden rounded-full bg-white px-5 text-[14px] font-bold text-brand-700">
                Try the demo <Icon name="arrowUpRight" className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </div>

        {/* numbered accordion */}
        <div className="space-y-4">
          {FAQ.map((f, k) => {
            const on = open === k;
            return (
              <motion.div key={f.q} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: k * 0.06, duration: 0.6, ease: EASE }}
                className={`rounded-[26px] p-[1.5px] transition-all duration-500 ${on ? "bg-gradient-to-br from-accent-500 via-sky-400 to-teal-400 shadow-[0_24px_60px_-28px_rgba(59,130,246,0.55)]" : "bg-line"}`}>
                <div className="rounded-[25px] bg-white">
                  <button type="button" onClick={() => setOpen(on ? null : k)} aria-expanded={on} className="flex w-full items-center gap-5 px-6 py-6 text-left sm:px-8">
                    <span className={`font-display text-[34px] font-extrabold leading-none tabular-nums transition-colors sm:text-[44px] ${on ? "lp-gradient-text-dark" : "text-line-strong"}`}>{String(k + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 text-[17px] font-bold leading-snug text-ink sm:text-[19px]">{f.q}</span>
                    <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-300 ${on ? "bg-brand-700" : "bg-surface-2"}`}>
                      <span className={`absolute h-0.5 w-4 rounded ${on ? "bg-white" : "bg-ink-2"}`} />
                      <motion.span animate={{ rotate: on ? 90 : 0, opacity: on ? 0 : 1 }} className="absolute h-4 w-0.5 rounded bg-ink-2" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
                        <div className="mx-6 mb-6 border-l-[3px] border-accent-500/60 pl-5 sm:mx-8 sm:ml-[92px]">
                          <p className="text-[15.5px] leading-relaxed text-ink-2">{f.a}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
