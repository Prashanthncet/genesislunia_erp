"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Input, PhoneLink, Select, useToast } from "@/components/ui";
import type { Hostel, Visitor } from "./types";

export function VisitorsPanel({ canDesk }: { canDesk: boolean }) {
  const toast = useToast();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ hostel_id: "", visitor_name: "", visitor_phone: "", whom_to_meet: "", purpose: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setVisitors(await apiFetch<Visitor[]>(`/api/hostel/visitors${filter ? `?hostel_id=${filter}` : ""}`));
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    }
  }, [filter, toast]);

  useEffect(() => {
    apiFetch<Hostel[]>("/api/hostel").then((h) => { setHostels(h); setForm((f) => ({ ...f, hostel_id: f.hostel_id || h[0]?.id || "" })); }).catch(() => undefined);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const checkIn = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ pass_no: string }>("/api/hostel/visitors", {
        method: "POST",
        body: JSON.stringify({ ...form, hostel_id: form.hostel_id || undefined, visitor_phone: form.visitor_phone || undefined, purpose: form.purpose || undefined }),
      });
      toast.push(`Visitor checked in · pass ${res.pass_no}`, "success");
      setForm({ ...form, visitor_name: "", visitor_phone: "", whom_to_meet: "", purpose: "" });
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (id: string) => {
    try {
      await apiFetch(`/api/hostel/visitors/${id}/checkout`, { method: "PUT" });
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const time = (iso: string) => iso.replace("T", " ").slice(0, 16);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {canDesk && (
        <Card className="p-4">
          <CardHead title="Check in a visitor" icon="discipline" />
          <div className="space-y-2">
            <Select aria-label="Hostel visited" value={form.hostel_id} onChange={(e) => setForm({ ...form, hostel_id: e.target.value })}>
              <option value="">Not hostel-specific</option>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
            <Input placeholder="Visitor name *" value={form.visitor_name} onChange={(e) => setForm({ ...form, visitor_name: e.target.value })} />
            <Input placeholder="Phone" value={form.visitor_phone} onChange={(e) => setForm({ ...form, visitor_phone: e.target.value })} />
            <Input placeholder="Whom to meet *" value={form.whom_to_meet} onChange={(e) => setForm({ ...form, whom_to_meet: e.target.value })} />
            <Input placeholder="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            <Button variant="primary" loading={busy} disabled={!form.visitor_name.trim() || !form.whom_to_meet.trim()} onClick={checkIn}>Check in</Button>
          </div>
        </Card>
      )}
      <Card className={`p-4 ${canDesk ? "lg:col-span-2" : "lg:col-span-3"}`}>
        <CardHead
          title="Visitor log"
          icon="discipline"
          subtitle={`${visitors.filter((v) => !v.outTime).length} inside now`}
          actions={
            <Select aria-label="Filter visitors by hostel" className="field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All hostels</option>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          }
        />
        {visitors.length === 0 ? <EmptyState title="No visitors" icon="discipline" /> : (
          <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1 text-sm">
            {visitors.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2/70 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-semibold">{v.visitorName}</span>{" "}
                  {v.visitorPhone && <PhoneLink value={v.visitorPhone} className="text-xs" />}{" "}
                  <span className="text-xs text-ink-2">→ {v.whomToMeet}</span>
                  <div className="text-xs text-ink-3">
                    {v.hostelName ?? "General"} · Pass {v.passNo} · in {time(v.inTime)}{v.outTime ? ` · out ${time(v.outTime)}` : ""}{v.purpose ? ` · ${v.purpose}` : ""}
                  </div>
                </div>
                {v.outTime ? <Badge tone="slate">Left</Badge> : canDesk ? <Button size="sm" onClick={() => checkout(v.id)}>Check out</Button> : <Badge tone="amber">Inside</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
