"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, ToastHost } from "@/components/ui";
import { useRouteMeta } from "@/components/RouteMeta";

const NAV: { group: string; items: { path: string; name: string; icon: string; tone: string }[] }[] = [
  {
    group: "Overview",
    items: [{ path: "/", name: "Dashboard", icon: "home", tone: "text-brand-600" }],
  },
  {
    group: "Academics",
    items: [
      { path: "/students", name: "Students", icon: "students", tone: "text-blue-600" },
      { path: "/admissions", name: "Admissions", icon: "admissions", tone: "text-sky-600" },
      { path: "/academics", name: "Academics", icon: "academics", tone: "text-teal-600" },
      { path: "/timetable", name: "Timetable", icon: "timetable", tone: "text-violet-600" },
      { path: "/exams", name: "Exam Ledger", icon: "exams", tone: "text-orange-600" },
      { path: "/cbt", name: "CBT Tests", icon: "cbt", tone: "text-indigo-600" },
    ],
  },
  {
    group: "Operations",
    items: [
      { path: "/attendance", name: "Attendance", icon: "attendance", tone: "text-emerald-600" },
      { path: "/fees", name: "Fees", icon: "fees", tone: "text-amber-600" },
      { path: "/leaves", name: "Leaves & Passes", icon: "leaves", tone: "text-lime-600" },
      { path: "/hostel", name: "Hostel", icon: "hostel", tone: "text-cyan-600" },
    ],
  },
  {
    group: "People & Safety",
    items: [
      { path: "/staff", name: "Staff & Payroll", icon: "staff", tone: "text-fuchsia-600" },
      { path: "/discipline", name: "Discipline", icon: "discipline", tone: "text-rose-600" },
    ],
  },
  {
    group: "Insights",
    items: [
      { path: "/reports", name: "Reports", icon: "reports", tone: "text-emerald-700" },
      { path: "/notifications", name: "Notifications", icon: "bell", tone: "text-slate-600" },
    ],
  },
];

function roleLabel(raw: string): string {
  if (raw === "branch_admin" || raw.toLowerCase() === "principal") return "PRINCIPAL";
  if (raw === "teacher") return "TEACHER";
  if (raw === "warden") return "WARDEN";
  if (raw === "super_admin") return "ADMIN";
  return raw.toUpperCase() || "USER";
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useRouteMeta(pathname);
  useEffect(() => setMounted(true), []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("branch_id");
    router.push("/login");
  };

  const role = roleLabel(localStorage.getItem("role") ?? "");

  return (
    <ToastHost>
      {/* Ambient animated background orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl animate-[float_9s_ease-in-out_infinite]" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl animate-[float_11s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-400/15 blur-3xl animate-[float_13s_ease-in-out_infinite]" />
      </div>

      <div className="flex min-h-dvh flex-col overflow-x-clip">
        {/* ── Header ─────────────────────────────────────────── */}
        <header className="glass sticky top-0 z-40 border-x-0 border-t-0 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                className="btn-soft !px-2.5 !py-2 lg:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
              >
                <Icon name={mobileOpen ? "x" : "menu"} />
              </button>

              <Link href="/" className="group flex items-center gap-3" aria-label="Genesis Lumia ERP home">
                <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-sm font-black text-white shadow-soft">
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
                  <span className="relative">GL</span>
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-bold tracking-tight text-slate-900 transition-colors group-hover:text-brand-700">
                    Genesis Lumia ERP
                  </span>
                  <span className="block text-[11px] font-medium text-slate-400">Sainik School</span>
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/notifications"
                className="btn-soft relative !px-2.5 !py-2"
                aria-label="Notifications"
              >
                <Icon name="bell" />
                <span className="absolute -right-1 -top-1 grid h-4.5 w-4.5 min-w-[1.1rem] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white animate-[pulse-ring_2.4s_var(--ease-out-soft)_infinite]">
                  3
                </span>
              </Link>

              <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 py-1.5 pl-1.5 pr-3 sm:flex">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-xs font-black text-brand-950">
                  {role.charAt(0)}
                </span>
                <span className="text-[11px] font-bold tracking-wider text-slate-600">{role}</span>
              </div>

              <button onClick={handleLogout} className="btn-soft !px-2.5 !py-2" aria-label="Log out" title="Log out">
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-w-0 flex-1">
          {/* ── Sidebar ──────────────────────────────────────── */}
          {mobileOpen && (
            <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)} aria-hidden />
          )}

          <aside
            aria-label="Main navigation"
            className={`fixed inset-y-0 left-0 z-50 mt-14 w-72 overflow-y-auto overscroll-contain border-r border-slate-200/70 bg-white/85 backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:static lg:mt-0 lg:w-64 lg:translate-x-0 lg:bg-white/60 ${
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <nav className="flex min-h-full flex-col justify-between p-4">
              <div className="space-y-5">
                {NAV.map((group, gi) => (
                  <div key={group.group} style={{ animation: `slide-right 0.5s var(--ease-out-soft) ${gi * 60}ms both` }}>
                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {group.group}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((item, ii) => {
                        const active = pathname === item.path;
                        return (
                          <li
                            key={item.path}
                            style={{ animation: `slide-right 0.4s var(--ease-out-soft) ${gi * 60 + ii * 35}ms both` }}
                          >
                            <Link
                              href={item.path}
                              aria-current={active ? "page" : undefined}
                              className={`nav-link ${active
                                ? "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-[0_10px_24px_-14px_rgb(31_77_146/0.9)]"
                                : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
                            >
                              <span className={`grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200 ${active ? "bg-white/15 text-white" : `${item.tone} bg-slate-50`}`}>
                                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                              </span>
                              <span className="flex-1">{item.name}</span>
                              {active && (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-[fade-in_0.3s_ease-out_both]" aria-hidden />
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-brand-50 to-white p-4 text-center">
                <p className="text-[11px] font-semibold text-slate-500">
                  “Every Child, Every Opportunity, Every Day.”
                </p>
              </div>
            </nav>
          </aside>

          {/* ── Main ─────────────────────────────────────────── */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {/* `min-w-0` stops wide tables forcing the flex row wider than the viewport,
                which is the usual cause of a horizontal scrollbar on mobile. */}
            {mounted ? children : <div className="h-40" aria-hidden />}
          </main>
        </div>

        <footer className="border-t border-slate-200/70 bg-white/70 px-6 py-3 text-center text-xs text-slate-400 backdrop-blur">
          © {new Date().getFullYear()} Genesis Lumia ERP · Sainik School · all data branch-scoped
        </footer>
      </div>
    </ToastHost>
  );
}