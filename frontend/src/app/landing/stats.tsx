"use client";

/**
 * /landing — the stats bento under the hero. Light, colourful cards, each with a mini UI:
 * 20+ modules (the module grid), 16 roles (role chips), 6 portals (portal windows) and
 * 100% mobile (three phone screens). Everything animates in once when scrolled into view.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { animate, motion, useInView } from "motion/react";
import { Icon } from "@/components/ui";

const EASE = [0.22, 1, 0.36, 1] as const;

function Count({ to, suffix = "", on }: { to: number; suffix?: string; on: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [on, to]);
  return <>{v}{suffix}</>;
}

function Card({ className = "", style, delay = 0, children }: { className?: string; style?: CSSProperties; delay?: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      className={`group relative min-w-0 overflow-hidden rounded-[28px] p-6 ring-1 transition-shadow duration-500 hover:shadow-[0_30px_70px_-35px_rgba(20,43,74,0.45)] sm:p-7 ${className}`}
      style={style}
    >
      {children}
    </motion.div>
  );
}

function Head({ n, s, on, title, body, color }: { n: number; s?: string; on: boolean; title: string; body: string; color: string }) {
  return (
    <div className="relative">
      <p className="font-display text-[46px] font-extrabold leading-none tracking-[-0.03em] sm:text-[56px]" style={{ color }}><Count to={n} suffix={s} on={on} /></p>
      <p className="mt-2 text-[16px] font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13.5px] leading-snug text-ink-2">{body}</p>
    </div>
  );
}

/* ── 20+ modules ── */

const MODULES: [string, string, string][] = [
  ["students", "Students", "#3b82f6"], ["admissions", "Admissions", "#6366f1"], ["fees", "Fees", "#f59e0b"], ["attendance", "Attendance", "#10b981"],
  ["timetable", "Timetable", "#0ea5e9"], ["exams", "Exams", "#8b5cf6"], ["cbt", "Online tests", "#d946ef"], ["academics", "Academics", "#14b8a6"],
  ["leaves", "Leave", "#f97316"], ["hostel", "Hostel", "#0d9488"], ["discipline", "Discipline", "#f43f5e"], ["staff", "Staff", "#2563eb"],
  ["reports", "Reports", "#0284c7"], ["bell", "Notices", "#eab308"], ["bus", "Transport", "#16a34a"], ["book", "Library", "#7c3aed"],
  ["wallet", "Payroll", "#ca8a04"], ["shield", "Safeguarding", "#e11d48"], ["door", "Gate", "#475569"], ["building", "Campus", "#1d4ed8"],
];

function ModuleStack({ on }: { on: boolean }) {
  return (
    <div className="flex items-center">
      {MODULES.slice(0, 7).map(([icon, label, c], i) => (
        <motion.span
          key={label}
          title={label}
          initial={{ opacity: 0, x: -12 }}
          animate={on ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.25 + i * 0.07, duration: 0.45, ease: EASE }}
          className="-ml-2 grid h-10 w-10 place-items-center rounded-xl text-white ring-[3px] ring-white first:ml-0"
          style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)`, zIndex: 10 - i }}
        >
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </motion.span>
      ))}
      <motion.span initial={{ opacity: 0 }} animate={on ? { opacity: 1 } : {}} transition={{ delay: 0.8 }} className="-ml-2 grid h-10 w-10 place-items-center rounded-xl bg-white text-[12px] font-bold text-blue-700 shadow-sm ring-[3px] ring-white">+13</motion.span>
    </div>
  );
}

/* ── 16 roles ── */

const ROLE_CHIPS: [string, string][] = [
  ["Principal", "#7c3aed"], ["Vice principal", "#8b5cf6"], ["Admin", "#6366f1"], ["Office", "#3b82f6"],
  ["Accounts", "#f59e0b"], ["Teacher", "#10b981"], ["Class teacher", "#14b8a6"], ["Exam cell", "#d946ef"],
  ["Librarian", "#0ea5e9"], ["Warden", "#0d9488"], ["Security", "#475569"], ["Transport", "#16a34a"],
  ["HR", "#f97316"], ["Counsellor", "#e11d48"], ["Parent", "#2563eb"], ["Student", "#ca8a04"],
];

function RoleChips({ on }: { on: boolean }) {
  const chips: [string, string][] = [...ROLE_CHIPS.slice(0, 4), ["+12 more", ""]];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(([r, c], i) => (
        <motion.span
          key={r}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={on ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 0.3 + i * 0.07, type: "spring", stiffness: 380, damping: 22 }}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-[0_4px_12px_-8px_rgba(20,43,74,0.4)] ring-1 ${c ? "bg-white text-ink ring-line/80" : "bg-violet-600 text-white ring-violet-600"}`}
        >
          {c && <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />}{r}
        </motion.span>
      ))}
    </div>
  );
}

/* ── 6 portals ── */

const PORTALS: [string, string, string][] = [
  ["reports", "Leadership", "#0284c7"], ["staff", "Staff", "#10b981"], ["clipboard", "Office", "#6366f1"],
  ["hostel", "Hostel & gate", "#0d9488"], ["user", "Parent", "#f59e0b"], ["cbt", "Student", "#d946ef"],
];

function PortalRow({ on }: { on: boolean }) {
  return (
    <div className="flex gap-2">
      {PORTALS.map(([icon, label, c], i) => (
        <motion.span
          key={label}
          title={label}
          initial={{ opacity: 0, y: 10 }}
          animate={on ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3 + i * 0.08, duration: 0.45, ease: EASE }}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-[0_6px_16px_-10px_rgba(20,43,74,0.4)] ring-1 ring-line/80"
          style={{ color: c }}
        >
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </motion.span>
      ))}
    </div>
  );
}

/* ── 100% mobile ── */

function MiniPhone({ children, title, color, className = "", delay, on }: { children: ReactNode; title: string; color: string; className?: string; delay: number; on: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={on ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.7, ease: EASE }}
      className={`w-[132px] shrink-0 rounded-[22px] bg-ink p-[5px] shadow-[0_24px_50px_-20px_rgba(20,43,74,0.6)] sm:w-[150px] ${className}`}
    >
      <div className="relative h-[230px] overflow-hidden rounded-[18px] bg-white sm:h-[260px]">
        <div className="mx-auto mt-1.5 h-1 w-10 rounded-full bg-ink/15" />
        <div className="mx-2 mt-2 rounded-xl px-2.5 py-2 text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
          <p className="text-[10.5px] font-bold">{title}</p>
        </div>
        <div className="px-2 pt-2">{children}</div>
      </div>
    </motion.div>
  );
}

function Phones({ on }: { on: boolean }) {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-4">
      <MiniPhone title="Attendance" color="#10b981" delay={0.25} on={on} className="hidden rotate-[-6deg] sm:block">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 30 }, (_, i) => (
            <motion.span key={i} className="aspect-square rounded-full" initial={{ backgroundColor: "#e2e8f0" }} animate={on ? { backgroundColor: i === 7 || i === 19 ? "#f87171" : "#34d399" } : {}} transition={{ delay: 0.6 + i * 0.03 }} />
          ))}
        </div>
        <p className="mt-2.5 text-center text-[10px] font-bold text-emerald-600">28 of 30 present</p>
      </MiniPhone>
      <MiniPhone title="Fees" color="#f59e0b" delay={0.4} on={on} className="z-10 -translate-y-3">
        <p className="text-[9.5px] text-ink-3">Term fee</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-amber-100">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" initial={{ width: "0%" }} animate={on ? { width: "100%" } : {}} transition={{ delay: 0.8, duration: 1.2, ease: EASE }} />
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={on ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 1.7, type: "spring", stiffness: 300, damping: 18 }} className="mx-auto mt-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_10px_20px_-8px_#10b981]">
          <Icon name="check" className="h-6 w-6" />
        </motion.div>
        <p className="mt-2 text-center text-[11px] font-bold text-ink">Payment done</p>
        <div className="mt-3 rounded-lg bg-surface-2 py-1.5 text-center text-[9.5px] font-semibold text-ink-2">Download receipt</div>
      </MiniPhone>
      <MiniPhone title="Report card" color="#8b5cf6" delay={0.55} on={on} className="rotate-[6deg]">
        {[["Maths", 92], ["Science", 86], ["English", 78], ["Social", 88], ["Hindi", 81]].map(([sub, v], i) => (
          <div key={sub as string} className="mb-2">
            <div className="flex justify-between text-[9.5px] font-semibold text-ink-2"><span>{sub}</span><span>{v}</span></div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-violet-100">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500" initial={{ width: "0%" }} animate={on ? { width: `${v}%` } : {}} transition={{ delay: 0.9 + i * 0.1, duration: 0.9, ease: EASE }} />
            </div>
          </div>
        ))}
      </MiniPhone>
    </div>
  );
}

export function StatsBand() {
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div ref={ref} className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
      <Card className="bg-gradient-to-br from-[#eaf2ff] via-white to-[#eef4ff] ring-blue-100">
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-300/25 blur-3xl" />
        <Head n={20} s="+" on={on} title="Connected modules" body="One source of truth." color="#2563eb" />
        <div className="relative mt-5"><ModuleStack on={on} /></div>
      </Card>

      <Card delay={0.1} className="bg-gradient-to-br from-[#f4efff] via-white to-[#faf5ff] ring-violet-100">
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-300/25 blur-3xl" />
        <Head n={16} on={on} title="Roles" body="Each sees only what it needs." color="#7c3aed" />
        <div className="relative mt-5"><RoleChips on={on} /></div>
      </Card>

      <Card delay={0.2} className="bg-gradient-to-br from-[#fff6e8] via-white to-[#fffaf0] ring-amber-100">
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-300/25 blur-3xl" />
        <Head n={6} on={on} title="Portals" body="Leadership to parents." color="#d97706" />
        <div className="relative mt-5"><PortalRow on={on} /></div>
      </Card>

      <Card delay={0.15} className="bg-gradient-to-br from-[#e8fbf4] via-white to-[#eaf7ff] ring-emerald-100 md:col-span-3">
        <div aria-hidden className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />
        <div className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <Head n={100} s="%" on={on} title="Mobile-ready" body="Roll call, fee payment and report cards all work from a phone, for staff and parents alike." color="#059669" />
            <div className="mt-5 flex flex-wrap gap-2">
              {["Any phone browser", "Big, easy tap targets", "Same data as desktop"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink shadow-sm ring-1 ring-emerald-100">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="h-2.5 w-2.5" /></span>{t}
                </span>
              ))}
            </div>
          </div>
          <div className="min-w-0 pt-2 md:pr-4"><Phones on={on} /></div>
        </div>
      </Card>
    </div>
  );
}
