"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const MENU = [
  { path: "/admissions", name: "Admissions", color: "text-sky-700" },
  { path: "/attendance", name: "Attendance", color: "text-emerald-700" },
  { path: "/timetable", name: "Timetable", color: "text-purple-700" },
  { path: "/exams", name: "Ledger & Reports", color: "text-orange-700" },
  { path: "/notifications", name: "Notifications", color: "text-rose-700" },
];

function roleLabel(raw: string): string {
  if (raw === "branch_admin" || raw.toLowerCase() === "principal") return "PRINCIPAL";
  if (raw === "teacher") return "TEACHER";
  if (raw === "warden") return "WARDEN";
  return raw.toUpperCase() || "USER";
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("branch_id");
    router.push("/login");
  };

  const role = roleLabel(localStorage.getItem("role") ?? "");

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between bg-[#0f2a43] px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <button
            className="rounded p-2 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className="block h-0.5 w-5 bg-white" />
            <span className="mt-1 block h-0.5 w-5 bg-white" />
            <span className="mt-1 block h-0.5 w-5 bg-white" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-black">
              GL
            </div>
            <span className="font-bold tracking-wide">Genesis Lumia</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/notifications"
            className="relative rounded p-1 hover:bg-white/10"
            aria-label="Notifications"
          >
            🔔
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold">
              3
            </span>
          </Link>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold">
              {role.charAt(0)}
            </div>
            <span className="text-xs font-bold tracking-widest text-blue-100">{role}</span>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 mt-14 w-60 transform bg-white shadow-lg transition-transform lg:static lg:mt-0 lg:translate-x-0 lg:shadow-none ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="flex h-full flex-col justify-between p-3">
            <div className="space-y-1">
              {MENU.map((item) => {
                const active = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "bg-[#0f2a43] text-white"
                        : `text-slate-700 hover:bg-slate-100 ${item.color}`
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-[11px] font-semibold text-slate-500">
                Every Child, Every Opportunity, Every Day.
              </p>
            </div>
          </nav>
        </aside>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-500">
        © {new Date().getFullYear()} Genesis Lumia ERP. All rights reserved.
      </footer>
    </div>
  );
}
