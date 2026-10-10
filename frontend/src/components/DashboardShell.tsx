"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ToastHost } from "@/components/ui";
import { NotificationStackPopover } from "@/components/NotificationStackPopover";
import { CommandPalette } from "@/components/motion/CommandPalette";

interface NavItem {
  name: string;
  href: string;
  badge?: number;
  icon: (props: { className?: string }) => React.JSX.Element;
}

// Icons exactly styled as in the UI mock
const Icons = {
  Dashboard: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Students: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Teachers: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Attendance: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  ),
  Classes: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10M6 10h10" />
    </svg>
  ),
  Timetable: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="14" x2="8" y2="14.01" />
      <line x1="12" y1="14" x2="12" y2="14.01" />
      <line x1="16" y1="14" x2="16" y2="14.01" />
    </svg>
  ),
  Assignments: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  ),
  Exams: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Fees: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  Messages: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  Reports: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Settings: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Search: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Bell: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Help: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  ChevronDown: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Menu: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  X: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Icons.Dashboard },
  { name: "Students", href: "/students", icon: Icons.Students },
  { name: "Teachers", href: "/staff", icon: Icons.Teachers },
  { name: "Attendance", href: "/attendance", icon: Icons.Attendance },
  { name: "Classes", href: "/classes", icon: Icons.Classes },
  { name: "Timetable", href: "/timetable", icon: Icons.Timetable },
  { name: "Assignments", href: "/academics", icon: Icons.Assignments },
  { name: "Exams", href: "/exams", icon: Icons.Exams },
  { name: "Fees", href: "/fees", icon: Icons.Fees },
  { name: "Messages", href: "/notifications", badge: 3, icon: Icons.Messages },
  { name: "Reports", href: "/reports", icon: Icons.Reports },
  { name: "Settings", href: "/settings", icon: Icons.Settings },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState("Teacher");
  const [userDropdown, setUserDropdown] = useState(false);

  useEffect(() => {
    const rawRole = localStorage.getItem("role") || "teacher";
    if (rawRole === "super_admin") setRole("Administrator");
    else if (rawRole === "branch_admin" || rawRole.toLowerCase() === "principal") setRole("Principal");
    else if (rawRole === "teacher") setRole("Teacher");
    else if (rawRole === "warden") setRole("Warden");
    else setRole("User");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("branch_id");
    router.push("/login");
  };

  return (
    <ToastHost>
      <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
        {/* ── Desktop & Tablet Sidebar (Deep Navy #0E2442) ── */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[250px] shrink-0 flex-col justify-between bg-[#0E2442] text-white transition-transform duration-300 ease-in-out lg:static lg:h-screen lg:translate-x-0 ${
            mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          }`}
        >
          <div className="flex flex-col flex-1 overflow-y-auto">
            {/* Logo Header */}
            <div className="flex items-center gap-3 px-5 py-5 shrink-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-md">
                <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3L1 9L12 15L21 10.09V17H23V9M5 13.18V17.18L12 21L19 17.18V13.18L12 17L5 13.18Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold leading-tight tracking-tight text-white">Genesis Lumia ERP</h1>
                <p className="text-[11px] font-medium text-slate-400">Sainik School</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="ml-auto text-slate-400 hover:text-white lg:hidden"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav List */}
            <nav className="flex-1 space-y-1 px-3 py-2">
              {NAV_ITEMS.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const IconComp = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-150 ${
                      active
                        ? "bg-[#2563EB] text-white shadow-sm font-semibold"
                        : "text-slate-300 hover:bg-[#163259] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <IconComp className={`h-[18px] w-[18px] transition-colors ${active ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer — School Emblem & System Badge */}
          <div className="p-3 shrink-0 border-t border-white/[0.08] bg-[#09182E]/80 backdrop-blur-md">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5 border border-white/5 transition-all duration-200 hover:bg-white/[0.08] hover:border-white/10 group">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-400/25 shadow-xs group-hover:scale-105 transition-transform duration-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50 animate-pulse" />
                  <p className="text-[12px] font-bold text-slate-100 truncate tracking-tight">Sainik School</p>
                </div>
                <p className="text-[10.5px] font-medium text-slate-400 truncate mt-0.5">Session 2026–27 · Online</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Main Content Area ── */}
        <div className="flex flex-1 flex-col h-screen overflow-y-auto min-w-0">
          {/* Top Navbar */}
          <header className="sticky top-0 z-30 shrink-0 flex h-[68px] items-center justify-between border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md px-4 sm:px-6 lg:px-8">
            {/* Mobile Menu & Search */}
            <div className="flex items-center gap-3 flex-1 max-w-xl">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              >
                <Icons.Menu className="h-6 w-6" />
              </button>

              {/* Command Palette Search Trigger */}
              <CommandPalette />
            </div>

            {/* Right Top Actions */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Notification Bell with Motion Stack Popover */}
              <NotificationStackPopover />

              {/* Help Button */}
              <button className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Icons.Help className="h-4 w-4 text-slate-500" />
                <span>Help</span>
              </button>

              {/* User Profile Pill */}
              <div className="relative">
                <button
                  onClick={() => setUserDropdown(!userDropdown)}
                  className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-50 transition"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C3AED] text-xs font-bold text-white">
                    {role.charAt(0)}
                  </div>
                  <span className="hidden sm:inline text-xs font-semibold text-slate-700">{role}</span>
                  <Icons.ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {userDropdown && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-50">
                    <div className="px-3 py-2 text-xs border-b border-slate-100">
                      <p className="font-semibold text-slate-800">{role}</p>
                      <p className="text-slate-400 truncate">sainik01.edu</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 mt-1"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page Children with smooth page transition */}
          <main key={pathname} className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1600px] w-full mx-auto animate-page-enter">
            {children}
          </main>
        </div>
      </div>
    </ToastHost>
  );
}