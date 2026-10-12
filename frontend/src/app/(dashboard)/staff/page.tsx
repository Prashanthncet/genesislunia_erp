"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Field, Icon, Input, MailLink, PageHeader, Reveal, Select, useToast } from "@/components/ui";
import { X, Search, Plus, ChevronDown, ChevronLeft, ChevronRight, Menu, Users, DollarSign, Clock, TrendingUp, Briefcase, Mail, Phone, Building2, Star, Zap, Eye, Edit, Trash2, Download, Settings, Filter, Grid, List } from "lucide-react";

type Staff = {
  id: string; name: string; email: string; role: string; isActive: boolean;
  phone?: string; department?: string; salaryStructure?: { basicSalary: number; hra: number; da: number };
  joiningDate?: string;
};
type Payslip = {
  id: string; monthYear: string; grossSalary: number; netSalary: number; tdsDeduction: number; epfDeduction: number; otherDeductions: number; status: string;
  staff: { id: string; name: string };
};
type Tab = "staff" | "salary" | "payroll";

const COLOR_SETS = [
  { bg: "bg-slate-100", gradient: "from-slate-700 to-slate-900", accent: "text-slate-700", light: "bg-slate-200" },
  { bg: "bg-emerald-100", gradient: "from-emerald-700 to-teal-900", accent: "text-emerald-700", light: "bg-emerald-200" },
  { bg: "bg-violet-100", gradient: "from-violet-700 to-purple-900", accent: "text-violet-700", light: "bg-violet-200" },
  { bg: "bg-amber-100", gradient: "from-amber-700 to-orange-900", accent: "text-amber-700", light: "bg-amber-200" },
  { bg: "bg-rose-100", gradient: "from-rose-700 to-pink-900", accent: "text-rose-700", light: "bg-rose-200" },
  { bg: "bg-cyan-100", gradient: "from-cyan-700 to-blue-900", accent: "text-cyan-700", light: "bg-cyan-200" },
  { bg: "bg-indigo-100", gradient: "from-indigo-700 to-blue-900", accent: "text-indigo-700", light: "bg-indigo-200" },
  { bg: "bg-fuchsia-100", gradient: "from-fuchsia-700 to-purple-900", accent: "text-fuchsia-700", light: "bg-fuchsia-200" },
];

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", email: "", role: "Teacher", phone: "", department: "", subjects: "", maxPeriods: "6" });
  
  const [salStaff, setSalStaff] = useState("");
  const [sal, setSal] = useState({ basic_salary: "", hra: "0", da: "0", tds_percent: "0", epf_percent: "12" });
  
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  
  const [floatParticles, setFloatParticles] = useState<{ id: number; x: number; y: number; size: number; delay: number }[]>([]);
  const particlesRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  useEffect(() => {
    const particles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
    }));
    setFloatParticles(particles);
    
    if (particlesRef.current) clearInterval(particlesRef.current);
    particlesRef.current = setInterval(() => {
      setFloatParticles(prev => prev.map(p => ({
        ...p,
        y: (p.y + 0.3) % 100,
        x: p.x + (Math.random() - 0.5) * 0.5,
      })));
    }, 50);
    
    return () => {
      if (particlesRef.current) clearInterval(particlesRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, ps] = await Promise.all([
        apiFetch<Staff[]>("/api/staff"),
        apiFetch<Payslip[]>("/api/staff/payslips"),
      ]);
      setStaff(st ?? []);
      setPayslips(ps ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.email) return setMessage("Name and email are required");
    setLoading(true);
    try {
      const body = JSON.stringify({
        name: form.name, email: form.email, role: form.role, phone: form.phone || undefined,
        department: form.department || undefined, subjects: form.subjects || undefined,
        max_periods_per_day: Number(form.maxPeriods) || undefined,
      });
      if (form.id) await apiFetch(`/api/staff/${form.id}`, { method: "PUT", body });
      else await apiFetch("/api/staff", { method: "POST", body });
      setShowForm(false);
      setForm({ id: "", name: "", email: "", role: "Teacher", phone: "", department: "", subjects: "", maxPeriods: "6" });
      await load();
      setMessage("Saved ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deactivate = async (id: string) => {
    try { await apiFetch(`/api/staff/${id}`, { method: "DELETE" }); await load(); setMessage("Removed (soft-deactivated if history exists)"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const saveSalary = async () => {
    if (!salStaff || !sal.basic_salary) return setMessage("Staff and basic salary are required");
    setLoading(true);
    try {
      await apiFetch(`/api/staff/salaries/${salStaff}`, {
        method: "PUT",
        body: JSON.stringify({
          basic_salary: Number(sal.basic_salary), hra: Number(sal.hra), da: Number(sal.da),
          tds_percent: Number(sal.tds_percent), epf_percent: Number(sal.epf_percent),
        }),
      });
      await load();
      setMessage("Salary structure saved ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const generate = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ generated: number; skipped: number }>("/api/staff/payslips/generate", {
        method: "POST", body: JSON.stringify({ month }),
      });
      await load();
      setMessage(`Generated ${res.generated}, skipped ${res.skipped} (already generated)`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const markPaid = async (id: string) => {
    try { await apiFetch(`/api/staff/payslips/${id}/mark-paid`, { method: "PUT" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const departments = [...new Set(staff.map(s => s.department).filter(Boolean))];
  const roles = [...new Set(staff.map(s => s.role))];

  const getColorSet = (index: number) => COLOR_SETS[index % COLOR_SETS.length];
  
  const filteredStaff = staff.filter(s => {
    const matchesSearch = !searchQuery || 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.department?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !departmentFilter || s.department === departmentFilter;
    const matchesRole = !roleFilter || s.role === roleFilter;
    const matchesStatus = !statusFilter || (statusFilter === "Active" ? s.isActive : !s.isActive);
    return matchesSearch && matchesDept && matchesRole && matchesStatus;
  });

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative min-h-screen">
      {/* Geometric Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>
        {floatParticles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full bg-blue-400/20 animate-pulse"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${3 + p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <PageHeader
              icon="staff"
              title="Staff & Payroll"
              subtitle="Manage personnel, salary structures, and payroll operations"
              actions={
                tab === "staff" && (
                  <Button variant="primary" onClick={() => { setForm({ id: "", name: "", email: "", role: "Teacher", phone: "", department: "", subjects: "", maxPeriods: "6" }); setShowForm(true); }}>
                    <Plus className="h-4 w-4" /> Add Staff
                  </Button>
                )
              }
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-all duration-200">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
            <button className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all duration-200">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6">
          <button
            onClick={() => { setTab("staff"); setViewMode("list"); }}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${tab === "staff" ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Users className="h-4 w-4" />
            Staff Directory
            <span className={`px-2 py-0.5 text-xs rounded-md ${tab === "staff" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
              {staff.length}
            </span>
          </button>
          <button
            onClick={() => setTab("salary")}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${tab === "salary" ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Briefcase className="h-4 w-4" />
            Salary Structures
          </button>
          <button
            onClick={() => { setTab("payroll"); setViewMode("list"); }}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${tab === "payroll" ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <DollarSign className="h-4 w-4" />
            Payroll & Payslips
            <span className={`px-2 py-0.5 text-xs rounded-md ${tab === "payroll" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
              {payslips.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 p-6 space-y-6">
        
        {tab === "staff" && (
          <div key="staff" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total Staff", value: staff.length, icon: Users, color: "text-slate-700", bg: "bg-slate-100", delay: 0 },
                { label: "Active Staff", value: staff.filter(s => s.isActive).length, icon: TrendingUp, color: "text-emerald-700", bg: "bg-emerald-100", delay: 100 },
                { label: "Departments", value: departments.length, icon: Building2, color: "text-violet-700", bg: "bg-violet-100", delay: 200 },
                { label: "Avg Periods/Day", value: Math.round(staff.reduce((acc, s) => acc + (5), 0) / Math.max(staff.length, 1) * 10) / 10, icon: Clock, color: "text-amber-700", bg: "bg-amber-100", delay: 300 },
              ].map((kpi, idx) => (
                <Reveal key={kpi.label} delay={kpi.delay}>
                  <div className={`group relative rounded-2xl ${kpi.bg} p-5 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                      background: `linear-gradient(135deg, ${kpi.bg.replace("bg-", "")}/30 0%, transparent 50%)`,
                    }} />
                    <div className="relative z-10 flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{kpi.label}</p>
                        <p className={`mt-2 text-3xl font-bold ${kpi.color} transition-all duration-300 group-hover:scale-110`}>
                          {kpi.value}
                        </p>
                      </div>
                      <div className={`p-3 rounded-xl ${kpi.bg} ${kpi.color} group-hover:rotate-12 transition-transform duration-300`}>
                        <kpi.icon className="h-6 w-6" />
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Filters */}
            <Reveal delay={60}>
              <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search staff, department, role..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
                
                <div className="relative">
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
                
                <div className="relative">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  >
                    <option value="">All Roles</option>
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
                
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  >
                    <option value="">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
                
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2.5 ${viewMode === "grid" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2.5 ${viewMode === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Reveal>

            {/* Staff Grid/List */}
            <Reveal delay={120}>
              {viewMode === "list" ? (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-5 py-3.5 whitespace-nowrap">Staff Member</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Role</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Department</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
                          <th className="px-4 py-3.5 whitespace-nowrap text-right">Gross Salary</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Joined</th>
                          <th className="px-4 py-3.5 whitespace-nowrap">Contact</th>
                          <th className="px-5 py-3.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredStaff.map((s, idx) => {
                          const colors = getColorSet(idx);
                          const salary = s.salaryStructure ? s.salaryStructure.basicSalary + s.salaryStructure.hra + s.salaryStructure.da : 0;
                          return (
                            <tr
                              key={s.id}
                              onClick={() => { setSelectedStaff(s); setDrawerOpen(true); }}
                              className="group transition-colors duration-150 hover:bg-blue-50/40 cursor-pointer"
                            >
                              <td className="px-5 py-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${colors.gradient} text-white text-xs font-bold shadow-xs`}>
                                    {getInitials(s.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{s.name}</p>
                                    <p className="text-xs text-slate-400 font-normal truncate max-w-[220px]">{s.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <Badge tone={s.role === "Principal" ? "brand" : s.role === "Warden" ? "violet" : "slate"}>
                                  {s.role}
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                                {s.department || "—"}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <Badge tone={s.isActive ? "emerald" : "slate"} className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${s.isActive ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                                  {s.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-xs text-slate-700 font-semibold">
                                {salary > 0 ? fmt(salary) : "—"}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                                {s.joiningDate ? new Date(s.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                                {s.phone ? (
                                  <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" /> {s.phone}
                                  </a>
                                ) : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-5 py-3.5 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => { setForm({ id: s.id, name: s.name, email: s.email, role: s.role, phone: s.phone || "", department: s.department || "", subjects: "", maxPeriods: "6" }); setShowForm(true); }}
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition shadow-2xs"
                                    title="Edit"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deactivate(s.id)}
                                    className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-800 transition shadow-2xs"
                                    title="Remove"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredStaff.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-12 text-center">
                              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-3">
                                <Users className="h-7 w-7 text-slate-400" />
                              </div>
                              <p className="text-sm font-medium text-slate-600">No staff members found</p>
                              <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between px-6 py-4 bg-slate-50/50 border-t border-slate-200 text-sm text-slate-600">
                    <span>{filteredStaff.length} of {staff.length} staff</span>
                    <div className="flex items-center gap-2">
                      <button disabled className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 cursor-not-allowed">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium">Page 1</span>
                      <button disabled className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 cursor-not-allowed">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Grid View */
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredStaff.map((s, idx) => {
                    const colors = getColorSet(idx);
                    const salary = s.salaryStructure ? s.salaryStructure.basicSalary + s.salaryStructure.hra + s.salaryStructure.da : 0;
                    return (
                      <div
                        key={s.id}
                        onClick={() => { setSelectedStaff(s); setDrawerOpen(true); }}
                        className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                        style={{
                          animation: `fade-up 0.4s ease-out ${idx * 80}ms both`,
                          animationName: "fade-up",
                        }}
                      >
                        {/* Geometric accent */}
                        <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 opacity-20 group-hover:opacity-30 group-hover:scale-110 transition-all duration-300 blur-md" />
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-bl-xl" />
                        
                        <div className="flex items-start justify-between mb-4">
                          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${colors.gradient} text-white font-bold text-lg shadow-md group-hover:rotate-6 transition-transform duration-300`}>
                            {getInitials(s.name)}
                          </div>
                          <Badge tone={s.isActive ? "emerald" : "slate"} className="shadow-sm">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {s.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        
                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{s.name}</h3>
                        <p className="text-xs text-slate-500 mb-1">{s.email}</p>
                        
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${colors.bg} ${colors.accent}`}>
                            <Briefcase className="h-3 w-3" />
                            {s.role}
                          </span>
                          {s.department && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                              <Building2 className="h-3 w-3" />
                              {s.department}
                            </span>
                          )}
                        </div>
                        
                        <div className="mt-4 flex items-center justify-between text-sm">
                          <span className="text-slate-600">
                            {salary > 0 ? (
                              <span className="font-semibold text-slate-800 font-mono tnum">{fmt(salary)}</span>
                            ) : (
                              <span className="text-slate-400">No salary</span>
                            )}
                          </span>
                          <button className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all duration-200 opacity-0 group-hover:opacity-100">
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Reveal>
          </div>
        )}

        {tab === "salary" && (
          <div key="salary" className="max-w-2xl space-y-6">
            <Reveal delay={60}>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Set Salary Structure</h3>
                    <p className="text-sm text-slate-500">Configure base salary, allowances, and deductions</p>
                  </div>
                </div>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Staff Member</label>
                    <div className="relative">
                      <select
                        value={salStaff}
                        onChange={(e) => {
                          setSalStaff(e.target.value);
                          const existing = staff.find((s) => s.id === e.target.value)?.salaryStructure;
                          if (existing) setSal({ basic_salary: String(existing.basicSalary), hra: String(existing.hra), da: String(existing.da), tds_percent: "0", epf_percent: "12" });
                        }}
                        className="appearance-none w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      >
                        <option value="">Select staff...</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Basic Salary (₹) *</label>
                      <input
                        value={sal.basic_salary}
                        onChange={(e) => setSal({ ...sal, basic_salary: e.target.value })}
                        type="number"
                        placeholder="Enter amount"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">HRA (₹)</label>
                      <input
                        value={sal.hra}
                        onChange={(e) => setSal({ ...sal, hra: e.target.value })}
                        type="number"
                        placeholder="House Rent Allowance"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">DA (₹)</label>
                      <input
                        value={sal.da}
                        onChange={(e) => setSal({ ...sal, da: e.target.value })}
                        type="number"
                        placeholder="Dearness Allowance"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">TDS (%)</label>
                      <input
                        value={sal.tds_percent}
                        onChange={(e) => setSal({ ...sal, tds_percent: e.target.value })}
                        type="number"
                        placeholder="Tax deduction"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">EPF (%)</label>
                      <input
                        value={sal.epf_percent}
                        onChange={(e) => setSal({ ...sal, epf_percent: e.target.value })}
                        type="number"
                        placeholder="Employee Provident Fund"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="text-xs text-slate-500">
                      Salary structure affects monthly payroll calculations
                    </div>
                    <Button variant="primary" onClick={saveSalary} loading={loading}>
                      <Plus className="h-4 w-4" /> Save Structure
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>
            
            <Reveal delay={120}>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-violet-100 text-violet-600">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Salary Structures</h3>
                    <p className="text-sm text-slate-500">Current salary configurations for all staff</p>
                  </div>
                </div>
                
                {staff.filter(s => s.salaryStructure).length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
                    <Briefcase className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600">No salary structures configured</p>
                    <p className="text-xs text-slate-400 mt-1">Set up salary details for your staff members</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {staff.filter(s => s.salaryStructure).map((s, idx) => {
                      const colors = getColorSet(idx);
                      const total = (s.salaryStructure?.basicSalary || 0) + (s.salaryStructure?.hra || 0) + (s.salaryStructure?.da || 0);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between py-4 px-4 hover:bg-slate-50 transition-colors duration-200"
                          style={{
                            animation: `fade-in 0.3s ease-out ${idx * 50}ms both`,
                            animationName: "fade-in",
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${colors.gradient} text-white text-xs font-bold shadow-sm`}>
                              {getInitials(s.name)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                              <p className="text-xs text-slate-500">{s.role}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-800 font-mono tnum">{fmt(total)}</p>
                            <p className="text-xs text-slate-500">Gross / month</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        )}

        {tab === "payroll" && (
          <div key="payroll" className="space-y-6">
            <Reveal delay={60}>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">Generate Payslips</h3>
                        <p className="text-sm text-slate-500">Process monthly payroll for all staff</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4">
                      <div className="relative">
                        <input
                          value={month}
                          onChange={(e) => setMonth(e.target.value)}
                          type="month"
                          className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 w-40"
                        />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      </div>
                      <Button variant="primary" onClick={generate} loading={loading} className="shadow-lg shadow-blue-500/20">
                        <Zap className="h-4 w-4" /> Generate Payslips
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-slate-100 p-4 border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Staff</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{staff.length}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-100 p-4 border border-emerald-200">
                    <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Processed</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">{payslips.filter(p => p.status === "Processed").length}</p>
                  </div>
                  <div className="rounded-xl bg-violet-100 p-4 border border-violet-200">
                    <p className="text-xs font-medium text-violet-700 uppercase tracking-wide">Monthly Cost</p>
                    <p className="text-2xl font-bold text-violet-700 mt-1 font-mono tnum">
                      {fmt(payslips.reduce((sum, p) => sum + p.netSalary, 0))}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
            
            <Reveal delay={120}>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-5 py-3.5 whitespace-nowrap">Staff Member</th>
                        <th className="px-4 py-3.5 whitespace-nowrap">Month</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">Gross</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">TDS</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">EPF</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">Other</th>
                        <th className="px-4 py-3.5 whitespace-nowrap text-right">Net Pay</th>
                        <th className="px-5 py-3.5 whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {payslips.map((p) => (
                        <tr
                          key={p.id}
                          className="group transition-colors duration-150 hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-white text-xs font-bold shadow-xs">
                                {getInitials(p.staff.name)}
                              </div>
                              <p className="font-semibold text-slate-900 text-sm">{p.staff.name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 font-medium">{p.monthYear}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-slate-600 text-right font-mono tnum">{fmt(p.grossSalary)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-rose-600 text-right font-mono tnum">-{fmt(p.tdsDeduction)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-rose-600 text-right font-mono tnum">-{fmt(p.epfDeduction)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm text-rose-600 text-right font-mono tnum">-{fmt(p.otherDeductions)}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-sm font-bold text-slate-900 text-right font-mono tnum">{fmt(p.netSalary)}</td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <Badge tone={p.status === "Paid" ? "emerald" : p.status === "Processed" ? "violet" : "amber"} className="inline-flex items-center gap-1.5 px-2.5 py-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${p.status === "Paid" ? "bg-emerald-500" : p.status === "Processed" ? "bg-violet-500" : "bg-amber-500"}`} />
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {payslips.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-3">
                              <DollarSign className="h-7 w-7 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">No payslips generated yet</p>
                            <p className="text-xs text-slate-400 mt-1">Generate payslips for the current month</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Reveal>
          </div>
        )}

        {/* Drawer */}
        {drawerOpen && selectedStaff && (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setDrawerOpen(false)}
            />
            <div
              className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto"
              style={{ animation: "slide-in-right 0.3s var(--ease-spring) both" }}
            >
              <div className="sticky top-0 flex items-center justify-between p-6 border-b border-slate-200 bg-white/90 backdrop-blur-xl z-10">
                <h2 className="text-xl font-bold text-slate-800">Staff Details</h2>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all duration-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Profile Header */}
                <div className="text-center">
                  <div className="flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold shadow-lg mx-auto mb-4">
                    {getInitials(selectedStaff.name)}
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">{selectedStaff.name}</h3>
                  <p className="text-sm text-slate-500">{selectedStaff.role}</p>
                  {selectedStaff.department && (
                    <p className="text-xs text-slate-400 mt-1">{selectedStaff.department}</p>
                  )}
                </div>
                
                {/* Status Card */}
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Status</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Employment Status</p>
                      <p className="font-semibold text-slate-800 flex items-center gap-2 mt-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${selectedStaff.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {selectedStaff.isActive ? "Active" : "Inactive"}
                      </p>
                    </div>
                    {selectedStaff.joiningDate && (
                      <div>
                        <p className="text-xs text-slate-500">Joining Date</p>
                        <p className="font-semibold text-slate-800 mt-1">
                          {new Date(selectedStaff.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Contact Card */}
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Contact</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <a href={`mailto:${selectedStaff.email}`} className="text-sm text-blue-600 hover:underline">
                        {selectedStaff.email}
                      </a>
                    </div>
                    {selectedStaff.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <a href={`tel:${selectedStaff.phone}`} className="text-sm text-blue-600 hover:underline">
                          {selectedStaff.phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Payroll Card */}
                {selectedStaff.salaryStructure && (
                  <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Payroll</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Basic Salary</p>
                        <p className="font-semibold text-slate-800 font-mono tnum mt-1">{fmt(selectedStaff.salaryStructure.basicSalary)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">HRA</p>
                        <p className="font-semibold text-slate-800 font-mono tnum mt-1">{fmt(selectedStaff.salaryStructure.hra)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">DA</p>
                        <p className="font-semibold text-slate-800 font-mono tnum mt-1">{fmt(selectedStaff.salaryStructure.da)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Gross Total</p>
                        <p className="font-semibold text-emerald-600 font-mono tnum mt-1">
                          {fmt(selectedStaff.salaryStructure.basicSalary + selectedStaff.salaryStructure.hra + selectedStaff.salaryStructure.da)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <Button variant="primary" onClick={() => {
                    setForm({ id: selectedStaff.id, name: selectedStaff.name, email: selectedStaff.email, role: selectedStaff.role, phone: selectedStaff.phone || "", department: selectedStaff.department || "", subjects: "", maxPeriods: "6" });
                    setShowForm(true);
                    setDrawerOpen(false);
                  }}>
                    <Edit className="h-4 w-4" /> Edit Staff
                  </Button>
                  <Button variant="danger" onClick={() => { deactivate(selectedStaff.id); setDrawerOpen(false); }}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modal */}
        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4"
            onClick={() => setShowForm(false)}
          >
            <div
              className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
              style={{ animation: "scale-in 0.3s var(--ease-spring) both" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{form.id ? "Edit Staff" : "Add Staff"}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {form.id ? "Update staff information" : "Register a new staff member"}
                  </p>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all duration-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter full name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="name@school.edu"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
                  <input
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="e.g. Mathematics"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Principal">Principal</option>
                    <option value="Vice Principal">Vice Principal</option>
                    <option value="Warden">Warden</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Administrative Staff">Administrative Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Subjects</label>
                  <input
                    value={form.subjects}
                    onChange={(e) => setForm({ ...form, subjects: e.target.value })}
                    placeholder="Math, Science (comma separated)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Max Periods/Day</label>
                  <input
                    type="number"
                    value={form.maxPeriods}
                    onChange={(e) => setForm({ ...form, maxPeriods: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button variant="soft" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button variant="primary" onClick={save} loading={loading} className="shadow-lg shadow-blue-500/20">
                  {form.id ? "Update" : "Save"} Staff
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

