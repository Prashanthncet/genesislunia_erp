"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, ProgressBar, Reveal, StatCard, useToast } from "@/components/ui";
import { TrendingUp, Users, DollarSign, AlertCircle, Clock, BookOpen, GraduationCap, Activity, Calendar, Download, RefreshCw } from "lucide-react";

type DashboardStats = {
  students_active: number;
  staff_active: number;
  classes: number;
  incidents_open: number;
  staff_leaves_pending: number;
  gate_passes_pending: number;
  admissions_in_progress: number;
  fees: {
    invoiced: number;
    collected: number;
    collection_pct: number | null;
  };
};

type AttendanceReport = { class_id: string; class_name: string; section: string | null; attendance_pct: number | null; total_records: number };
type FeeReport = {
  invoiced: number;
  collected: number;
  collection_pct: number | null;
  outstanding: number;
  invoice_count: number;
  by_status: Record<string, number>;
};

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceReport[]>([]);
  const [feeData, setFeeData] = useState<FeeReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [s, att, fee] = await Promise.all([
        apiFetch<DashboardStats>("/api/reports/dashboard"),
        apiFetch<AttendanceReport[]>("/api/reports/attendance"),
        apiFetch<FeeReport>("/api/reports/fees"),
      ]);
      setStats(asDashboardStats(s));
      setAttendanceData(att ?? []);
      setFeeData(fee ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const DEFAULT_STATS: DashboardStats = {
    students_active: 0,
    staff_active: 0,
    classes: 0,
    incidents_open: 0,
    staff_leaves_pending: 0,
    gate_passes_pending: 0,
    admissions_in_progress: 0,
    fees: { invoiced: 0, collected: 0, collection_pct: null },
  };
  const asDashboardStats = (raw: unknown): DashboardStats => {
    const s = raw == null ? null : (raw as Record<string, unknown>);
    if (!s) return DEFAULT_STATS;
    return {
      students_active: num(s.students_active ?? s.totalStudents),
      staff_active: num(s.staff_active ?? s.activeStaff ?? s.totalStaff),
      classes: num(s.classes ?? s.classesCount),
      incidents_open: num(s.incidents_open),
      staff_leaves_pending: num(s.staff_leaves_pending ?? s.pendingLeaves),
      gate_passes_pending: num(s.gate_passes_pending ?? s.openGatePasses),
      admissions_in_progress: num(s.admissions_in_progress),
      fees: asFees(s.fees),
    };
  };
  const asFees = (v: unknown): DashboardStats["fees"] => {
    if (!v || typeof v !== "object") return DEFAULT_STATS.fees;
    const o = v as Record<string, unknown>;
    return {
      invoiced: num(o.invoiced),
      collected: num(o.collected),
      collection_pct: o.collection_pct == null ? null : num(o.collection_pct),
    };
  };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const exportReport = async (type: string) => {
    try {
      const res = await fetch(`/api/reports/export/${type}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`${type} report exported ✓`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-slate-300 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader icon="reports" title="Reports & Analytics" subtitle="Real-time metrics and performance insights" />
          <div className="flex items-center gap-3">
            <select disabled className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 shadow-sm">
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">This Year</option>
            </select>
            <Button variant="primary" onClick={loadDashboard} loading={refreshing} className="shadow-lg shadow-blue-500/20"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-6 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}>
            <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl hover:shadow-2xl transition-shadow duration-300">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Students</span>
                <Users className="h-5 w-5 text-slate-500" />
              </div>
              <p className="text-3xl font-bold">{stats.students_active}</p>
              <div className="mt-2 flex items-center gap-1 text-sm text-emerald-400">
                <TrendingUp className="h-4 w-4" />
                <span>+12 this month</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Teachers</span>
                <GraduationCap className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-700">{stats.staff_active}</p>
              <p className="text-sm text-blue-600 mt-1">{stats.staff_active} active</p>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Attendance Rate</span>
                <Activity className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-bold text-emerald-700">
                {attendanceData.length > 0 && attendanceData.some(a => a.attendance_pct !== null)
                  ? `${Math.round(attendanceData.reduce((acc, c) => acc + (c.attendance_pct ?? 0), 0) / attendanceData.filter(a => a.attendance_pct !== null).length)}%`
                  : "--%"}
              </p>
              <ProgressBar
                value={attendanceData.length > 0 ? Math.round(attendanceData.reduce((acc, c) => acc + (c.attendance_pct ?? 0), 0) / attendanceData.length) : 0}
                tone="emerald"
                className="mt-2 h-2"
              />
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-violet-600 uppercase tracking-wide">Fees Collected</span>
                <DollarSign className="h-5 w-5 text-violet-600" />
              </div>
              <p className="text-3xl font-bold text-violet-700 font-mono">{formatCurrency(stats.fees.collected)}</p>
              <p className="text-sm text-violet-600 mt-1">{formatCurrency(Math.max(0, stats.fees.invoiced - stats.fees.collected))} outstanding</p>
            </div>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Attendance Trend / Breakdown */}
          <Reveal delay={100} className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-slate-800">Class Attendance Summary</h3>
                  <p className="text-sm text-slate-500">Live attendance rate per class</p>
                </div>
                <Button variant="soft" onClick={() => exportReport("attendance")}><Download className="h-4 w-4" /> Export</Button>
              </div>
              <div className="space-y-4">
                {attendanceData.map((cls, idx) => (
                  <div key={cls.class_id || idx} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                    <div className="w-36 text-sm text-slate-800 font-medium">
                      {cls.class_name} {cls.section ?? ""}
                    </div>
                    <div className="flex-1">
                      <ProgressBar
                        value={cls.attendance_pct ?? 0}
                        tone={(cls.attendance_pct ?? 0) >= 80 ? "emerald" : (cls.attendance_pct ?? 0) >= 60 ? "amber" : "rose"}
                        className="h-2.5"
                      />
                    </div>
                    <div className="w-24 text-right">
                      <span className="text-sm font-bold text-slate-700 font-mono">
                        {cls.attendance_pct !== null ? `${cls.attendance_pct}%` : "No data"}
                      </span>
                    </div>
                    <div className="w-28 text-right text-xs text-slate-400">
                      {cls.total_records} records
                    </div>
                  </div>
                ))}
                {attendanceData.length === 0 && (
                  <div className="py-8 text-center text-slate-400">No attendance data available</div>
                )}
              </div>
            </div>
          </Reveal>              {/* Quick Alerts */}
          <Reveal delay={200}>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Quick Alerts</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <span className="font-medium text-amber-800">Pending Leaves</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700">{stats.staff_leaves_pending}</p>
                  <p className="text-xs text-amber-600 mt-1">Requires approval</p>
                </div>
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="h-5 w-5 text-rose-600" />
                    <span className="font-medium text-rose-800">Open Gate Passes</span>
                  </div>
                  <p className="text-2xl font-bold text-rose-700">{stats.gate_passes_pending}</p>
                  <p className="text-xs text-rose-600 mt-1">Students outside</p>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">Classes</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">{stats.classes}</p>
                  <p className="text-xs text-blue-600 mt-1">Active classes</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Fee Collection Report */}
        <Reveal delay={200}>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-slate-800">Fee Collection Report</h3>
                <p className="text-sm text-slate-500">Monthly collection summary</p>
              </div>
              <Button variant="soft" onClick={() => exportReport("fees")}><Download className="h-4 w-4" /> Export</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 border-b border-slate-200">
                  <tr className="fade-in 0.3s ease-out both" style={{ animationName: "fade-in" }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Month</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Billed</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Collected</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Pending</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeData && feeData.invoice_count > 0 ? [
                    { month: "All terms", billed: feeData.invoiced, collected: feeData.collected, pending: feeData.outstanding, rate: feeData.collection_pct },
                  ].map((m) => (
                    <tr key={m.month} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">{m.month}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(m.billed)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-medium">{formatCurrency(m.collected)}</td>
                      <td className="px-4 py-3 text-right font-mono text-rose-600">{formatCurrency(m.pending)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <ProgressBar value={m.rate ?? 0} tone={m.rate && m.rate >= 80 ? "emerald" : m.rate && m.rate >= 50 ? "amber" : "rose"} className="w-20 h-2" />
                          <span className="text-xs text-slate-600 w-10">{(m.rate ?? 0) + "%"}</span>
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No fee data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        {/* Operational Metrics */}
        <Reveal delay={300}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Academic Performance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 text-center">
                  <p className="text-3xl font-bold text-emerald-700">87%</p>
                  <p className="text-sm text-emerald-600">Average Marks</p>
                  <p className="text-xs text-emerald-500 mt-1">+2.3% improvement</p>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 text-center">
                  <p className="text-3xl font-bold text-blue-700">94%</p>
                  <p className="text-sm text-blue-600">Pass Rate</p>
                  <p className="text-xs text-blue-500 mt-1">Above target</p>
                </div>
                <div className="p-4 rounded-xl bg-violet-50 text-center">
                  <p className="text-3xl font-bold text-violet-700">1,247</p>
                  <p className="text-sm text-violet-600">Total Enrollments</p>
                  <p className="text-xs text-violet-500 mt-1">+8% this year</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 text-center">
                  <p className="text-3xl font-bold text-amber-700">45</p>
                  <p className="text-sm text-amber-600">Pending Assignments</p>
                  <p className="text-xs text-amber-500 mt-1">Needs attention</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Resource Utilization</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div><p className="text-sm font-medium text-slate-700">Classrooms</p><p className="text-xs text-slate-500">Available: 24/30</p></div>
                  <ProgressBar value={80} tone="brand" className="w-24 h-2" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div><p className="text-sm font-medium text-slate-700">Teachers</p><p className="text-xs text-slate-500">Active: 18/20</p></div>
                  <ProgressBar value={90} tone="emerald" className="w-24 h-2" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div><p className="text-sm font-medium text-slate-700">Hostel Capacity</p><p className="text-xs text-slate-500">Filled: 156/200</p></div>
                  <ProgressBar value={78} tone="brand" className="w-24 h-2" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div><p className="text-sm font-medium text-slate-700">Library Books Issued</p><p className="text-xs text-slate-500">This month: 342</p></div>
                  <ProgressBar value={68} tone="amber" className="w-24 h-2" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

