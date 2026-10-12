"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, Reveal, StatCard, useToast } from "@/components/ui";
import { Bell, Mail, Send, CheckCircle, AlertCircle, X, Search, Clock, User, Filter } from "lucide-react";

type Notification = { id: string; channel: string; recipient: string; subject: string | null; body: string; status: string; createdAt: string };
type NotificationRow = Notification & { _title: string; _message: string; _read: boolean };
const mapNotification = (n: Notification): NotificationRow => ({ ...n, _title: n.subject ?? n.body.slice(0, 60) + (n.body.length > 60 ? "…" : ""), _message: n.body, _read: n.status === "sent" });

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const [newNotif, setNewNotif] = useState({ title: "", message: "", channel: "email", recipients: "" });
  const emptyNotif = { title: "", message: "", channel: "email", recipients: "" };

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Notification[]>("/api/notifications");
      setNotifications((data ?? []).map(mapNotification));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const sendBroadcast = async () => {
    if (!newNotif.title || !newNotif.message || !newNotif.recipients) return setMessage("All fields required");
    setSending(true);
    try {
      // Backend has no broadcast endpoint. The real contract is:
      // POST /api/notifications (notify) is internal-only; publicly the page can only
      // reflect logs from GET /api/notifications. We mirror the draft locally and load,
      // so the UI stays usable while we point the composer at a real gateway later.
      setMessage("Broadcast composer is a placeholder — connect NOTIFY_WEBHOOK_URL on the backend to enable sending.");
      setNewNotif(emptyNotif);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setSending(false); }
  };

  const markRead = async (id: string) => {
    // Backend does not expose a per-notification read endpoint. No-op UI-only state
    // transition is intentionally omitted so the page does not pretend to persist reads.
    setMessage("Read tracking is not yet wired to the backend. Logs are view-only for now.");
    await loadAll();
  };

  const markAllRead = async () => {
    // Backend has no /read-all route. Mirror the intent locally for now; log view-only.
    setMessage("Mark-all-read is not wired to the backend yet. Logs are view-only for now.");
    await loadAll();
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "--";

  const filtered = notifications.filter((n) => {
    if (searchQuery && !n._title.toLowerCase().includes(searchQuery.toLowerCase()) && !n._message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterChannel && n.channel !== filterChannel) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n._read).length;
  const sentCount = notifications.filter((n) => n.status === "sent").length;
  const failedCount = notifications.filter((n) => n.status === "failed" || n.status === "mocked").length;

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-violet-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <PageHeader icon="bell" title="Notifications" subtitle="Manage school-wide announcements and alerts" />
          {unreadCount > 0 && <Badge tone="brand" className="px-4 py-1.5 text-sm">{unreadCount} New</Badge>}
        </div>
        <div className="flex items-center gap-2 px-6">
          <button onClick={() => setShowComposer(!showComposer)} className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg bg-slate-900 text-white shadow-lg hover:bg-slate-800 transition-all duration-200">
            <Send className="h-4 w-4" /> New Broadcast
          </button>
        </div>
      </div>

      {/* Composer */}
      {showComposer && (
        <div className="relative z-10 px-6 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6" style={{ animation: "slide-down 0.3s ease-out both", animationName: "slide-down" }}>
            <h3 className="font-semibold text-slate-800 mb-4">Send Broadcast</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><input value={newNotif.title} onChange={(e) => setNewNotif({ ...newNotif, title: e.target.value })} placeholder="Subject *" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></div>
              <div className="md:col-span-2"><textarea value={newNotif.message} onChange={(e) => setNewNotif({ ...newNotif, message: e.target.value })} placeholder="Message *" rows={4} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><select value={newNotif.channel} onChange={(e) => setNewNotif({ ...newNotif, channel: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500"><option>email</option><option>SMS</option></select></div>
              <div><input value={newNotif.recipients} onChange={(e) => setNewNotif({ ...newNotif, recipients: e.target.value })} placeholder="Recipients (e.g. Grade 10, Parents)" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500" /></div>
              <div className="md:col-span-2 flex justify-end">
                <Button variant="primary" onClick={sendBroadcast} loading={sending} className="shadow-lg shadow-blue-500/20"><Send className="h-4 w-4" /> Send Broadcast</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 px-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}><div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl"><div className="flex items-center gap-3 mb-3"><Bell className="h-5 w-5 text-slate-500" /><span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total</span></div><p className="text-3xl font-bold">{notifications.length}</p></div></Reveal>
          <Reveal delay={100}><div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5"><div className="flex items-center gap-3 mb-3"><CheckCircle className="h-5 w-5 text-emerald-600" /><span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Sent</span></div><p className="text-3xl font-bold text-emerald-700">{sentCount}</p></div></Reveal>
          <Reveal delay={200}><div className="rounded-2xl bg-rose-50 border border-rose-200 p-5"><div className="flex items-center gap-3 mb-3"><AlertCircle className="h-5 w-5 text-rose-600" /><span className="text-xs font-medium text-rose-600 uppercase tracking-wide">Failed</span></div><p className="text-3xl font-bold text-rose-700">{failedCount}</p></div></Reveal>
          <Reveal delay={300}><div className="rounded-2xl bg-amber-50 border border-amber-200 p-5"><div className="flex items-center gap-3 mb-3"><Mail className="h-5 w-5 text-amber-600" /><span className="text-xs font-medium text-amber-600 uppercase tracking-wide">Unread</span></div><p className="text-3xl font-bold text-amber-700">{unreadCount}</p></div></Reveal>
        </div>

        <Reveal delay={100}>
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search notifications..." className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm focus:border-blue-500" /></div>
            <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500"><option value="">All Channels</option><option value="email">Email</option><option value="sms">SMS</option></select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-700 focus:border-blue-500"><option value="">All Status</option><option value="sent">Sent</option><option value="failed">Failed</option></select>
            <Button variant="soft" onClick={markAllRead} className="!px-4"><CheckCircle className="h-4 w-4" /> Mark All Read</Button>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {filtered.map((n, idx) => (
                <div key={n.id} className={`p-4 transition-all duration-200 hover:bg-slate-50 ${!n._read ? "bg-blue-50/30 border-l-2 border-l-blue-500" : ""}`} style={{ animation: `fade-in 0.3s ease-out ${idx * 30}ms both`, animationName: "fade-in" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className={`font-semibold ${!n._read ? "text-slate-900" : "text-slate-700"}`}>{n._title}</h4>
                        <Badge tone={n.channel === "email" ? "sky" : "violet"} className="text-xs">{n.channel.toUpperCase()}</Badge>
                        {!n._read && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>
                      <p className="text-sm text-slate-600">{n._message}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{n.recipient}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(n.createdAt)}</span>
                        <Badge tone={n.status === "sent" ? "emerald" : "rose"} className="ml-auto">{n.status}</Badge>
                      </div>
                    </div>                      <div className="flex items-center gap-2">
                      {!n._read && <button onClick={() => markRead(n.id)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="Read tracking is not wired to the backend yet"><CheckCircle className="h-4 w-4" /></button>}
                      <button className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="px-6 py-12 text-center text-slate-400">No notifications found</div>}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

