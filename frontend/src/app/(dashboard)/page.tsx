"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AttendanceOverviewChart } from "@/components/charts/AttendanceOverviewChart";
import { PerformanceBarChart } from "@/components/charts/PerformanceBarChart";
import { FeeCollectionDonutChart } from "@/components/charts/FeeCollectionDonutChart";

type Dashboard = {
  students_active: number;
  staff_active: number;
  classes: number;
  incidents_open: number;
  staff_leaves_pending: number;
  gate_passes_pending: number;
  admissions_in_progress: number;
  fees: { invoiced: number; collected: number; collection_pct: number | null };
};

type AttendanceRow = {
  class_id: string;
  class_name: string;
  section: string | null;
  attendance_pct: number | null;
  total_records: number;
};

type FeesReport = {
  invoiced: number;
  collected: number;
  outstanding: number;
  collection_pct: number | null;
  invoice_count: number;
};

export default function DashboardHome() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [fees, setFees] = useState<FeesReport | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [role, setRole] = useState("Teacher");

  useEffect(() => {
    const rawRole = localStorage.getItem("role") || "teacher";
    if (rawRole === "super_admin") setRole("Administrator");
    else if (rawRole === "branch_admin" || rawRole.toLowerCase() === "principal") setRole("Principal");
    else if (rawRole === "teacher") setRole("Teacher");
    else if (rawRole === "warden") setRole("Warden");
    else setRole("User");

    Promise.all([
      apiFetch<Dashboard>("/api/reports/dashboard").catch(() => null),
      apiFetch<FeesReport>("/api/reports/fees").catch(() => null),
      apiFetch<AttendanceRow[]>("/api/reports/attendance").catch(() => []),
    ]).then(([d, f, a]) => {
      if (d) setDash(d);
      if (f) setFees(f);
      if (a) setAttendance(a);
    });
  }, []);

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      {/* ── 1. Hero School Banner Section ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1E3A8A] via-[#2563EB] to-[#60A5FA] text-white shadow-sm">
        {/* Background Campus Photo with overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/school-banner.jpg"
            alt="School Campus"
            fill
            className="object-cover object-center opacity-30 mix-blend-overlay"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A]/90 via-[#1E3A8A]/70 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-6 sm:p-8 md:flex-row md:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Good evening, {role}!
            </h1>
            <p className="mt-1 text-sm text-blue-100 font-normal">
              Here&apos;s what&apos;s happening at Sainik School today.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end text-left md:text-right">
            <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
              Tuesday, 16 Sep 2026
            </span>
            <p className="mt-1 max-w-xs text-xs italic text-blue-100/90 font-medium">
              &ldquo;Education today for a brighter tomorrow.&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Top Metric KPI Cards (6 columns matching design) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card 1: Total Students */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-slate-900 tnum">
              {dash ? dash.students_active.toLocaleString() : "1,248"}
            </div>
            <div className="text-[12px] font-medium text-slate-500">Total Students</div>
            <div className="mt-1 flex items-center text-[11px] font-semibold text-emerald-600">
              <span>↑ +12%</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Teachers */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-slate-900 tnum">
              {dash ? dash.staff_active.toLocaleString() : "86"}
            </div>
            <div className="text-[12px] font-medium text-slate-500">Total Teachers</div>
            <div className="mt-1 flex items-center text-[11px] font-semibold text-emerald-600">
              <span>↑ +5%</span>
            </div>
          </div>
        </div>

        {/* Card 3: Attendance Rate */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#10B981]/10 text-[#10B981]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-slate-900 tnum">
              {dash && dash.fees ? "92%" : "92%"}
            </div>
            <div className="text-[12px] font-medium text-slate-500">Attendance Rate</div>
            <div className="mt-1 flex items-center text-[11px] font-semibold text-emerald-600">
              <span>↑ +2%</span>
            </div>
          </div>
        </div>

        {/* Card 4: Pending Fees */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F59E0B]/10 text-[#F59E0B]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-slate-900 tnum">
              {fees ? inr(Math.round(fees.outstanding)) : "₹4,50,000"}
            </div>
            <div className="text-[12px] font-medium text-slate-500">Pending Fees</div>
            <div className="mt-1 flex items-center text-[11px] font-semibold text-rose-500">
              <span>↓ +8%</span>
            </div>
          </div>
        </div>

        {/* Card 5: Upcoming Exams */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EC4899]/10 text-[#EC4899]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-slate-900 tnum">12</div>
            <div className="text-[12px] font-medium text-slate-500">Upcoming Exams</div>
            <div className="mt-1 flex items-center text-[11px] font-semibold text-slate-400">
              <span>Next: 5 days</span>
            </div>
          </div>
        </div>

        {/* Card 6: Announcements */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:shadow-sm transition relative">
          <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white">
            2
          </span>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0EA5E9]/10 text-[#0EA5E9]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-slate-900 tnum">6</div>
            <div className="text-[12px] font-medium text-slate-500">Announcements</div>
            <div className="mt-1 flex items-center text-[11px] font-semibold text-blue-600">
              <span>New updates</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Charts Row (Attendance Overview, Student Performance, Fee Collection) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Attendance Overview Area Chart (5 cols) */}
        <div className="lg:col-span-5">
          <AttendanceOverviewChart />
        </div>

        {/* Student Performance Bar Chart (4 cols) */}
        <div className="lg:col-span-4">
          <PerformanceBarChart />
        </div>

        {/* Fee Collection Donut / Gauge (3 cols) */}
        <div className="lg:col-span-3">
          <FeeCollectionDonutChart
            invoiced={fees?.invoiced}
            collected={fees?.collected}
            outstanding={fees?.outstanding}
            collectionPct={fees?.collection_pct}
          />
        </div>
      </div>

      {/* ── 4. Bottom Section: Quick Actions, Upcoming Events, Recent Activity ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Quick Actions (4 cols) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-4">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {/* Add Student */}
            <Link
              href="/admissions"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition group text-center"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-sm transition group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <span className="mt-2 text-[11px] font-semibold text-slate-700 leading-tight">
                Add<br />Student
              </span>
            </Link>

            {/* Mark Attendance */}
            <Link
              href="/attendance"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition group text-center"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#10B981] text-white shadow-sm transition group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>
                </svg>
              </div>
              <span className="mt-2 text-[11px] font-semibold text-slate-700 leading-tight">
                Mark<br />Attendance
              </span>
            </Link>

            {/* Create Announcement */}
            <Link
              href="/notifications"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition group text-center"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7C3AED] text-white shadow-sm transition group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
                </svg>
              </div>
              <span className="mt-2 text-[11px] font-semibold text-slate-700 leading-tight">
                Create<br />Announcement
              </span>
            </Link>

            {/* Generate Report */}
            <Link
              href="/reports"
              className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition group text-center"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F59E0B] text-white shadow-sm transition group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <span className="mt-2 text-[11px] font-semibold text-slate-700 leading-tight">
                Generate<br />Report
              </span>
            </Link>
          </div>
        </div>

        {/* Upcoming Events (4 cols) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Upcoming Events</h2>
            <Link href="/exams" className="text-xs font-semibold text-[#2563EB] hover:underline">
              View All →
            </Link>
          </div>

          <div className="space-y-3.5">
            {/* Event 1 */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center justify-center rounded-xl bg-blue-50 px-2.5 py-1 text-center min-w-[42px]">
                <span className="text-sm font-bold text-blue-600">18</span>
                <span className="text-[10px] font-semibold text-blue-400 uppercase">Sep</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  <h3 className="text-xs font-bold text-slate-800 truncate">Unit Test - Mathematics</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Class 8 - 10 | 09:00 AM</p>
              </div>
            </div>

            {/* Event 2 */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center justify-center rounded-xl bg-amber-50 px-2.5 py-1 text-center min-w-[42px]">
                <span className="text-sm font-bold text-amber-600">21</span>
                <span className="text-[10px] font-semibold text-amber-400 uppercase">Sep</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-bold text-slate-800 truncate">Parent Teacher Meeting</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">10:00 AM - 1:00 PM</p>
              </div>
            </div>

            {/* Event 3 */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center justify-center rounded-xl bg-emerald-50 px-2.5 py-1 text-center min-w-[42px]">
                <span className="text-sm font-bold text-emerald-600">25</span>
                <span className="text-[10px] font-semibold text-emerald-400 uppercase">Sep</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold text-slate-800 truncate">Science Exhibition</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">All Classes | 10:00 AM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity (4 cols) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Recent Activity</h2>
            <Link href="/reports" className="text-xs font-semibold text-[#2563EB] hover:underline">
              View All →
            </Link>
          </div>

          <div className="space-y-3">
            {/* Activity 1: Admission */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">New student admission</p>
                  <p className="text-[10px] text-slate-400 truncate">Rahul Kumar (Class 6)</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 font-medium">10 mins ago</span>
            </div>

            {/* Activity 2: Payment */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">Fee payment received</p>
                  <p className="text-[10px] text-slate-400 truncate">₹25,000 from Parent</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 font-medium">1 hour ago</span>
            </div>

            {/* Activity 3: Attendance marked */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">Attendance marked</p>
                  <p className="text-[10px] text-slate-400 truncate">Class 9 - 85% present</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 font-medium">2 hours ago</span>
            </div>

            {/* Activity 4: Announcement */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 shrink-0">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">New announcement</p>
                  <p className="text-[10px] text-slate-400 truncate">School will be closed on 2nd Oct</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 font-medium">3 hours ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}