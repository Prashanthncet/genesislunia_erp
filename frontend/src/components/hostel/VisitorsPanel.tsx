"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Input, PhoneLink, Select, useToast } from "@/components/ui";
import { confirmAction } from "@/components/confirm";
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
    if (!(await confirmAction({
      title: `Check in ${form.visitor_name.trim()}?`,
      text: `Visiting ${form.whom_to_meet.trim()}${form.hostel_id ? ` · ${hostels.find((h) => h.id === form.hostel_id)?.name ?? ""}` : ""}. A visitor pass number is issued.`,
      confirmText: "Check in",
      tone: "primary",
    }))) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ pass_no: string }>("/api/hostel/visitors", {
        method: "POST",
        body: JSON.stringify({ ...form, hostel_id: form.hostel_id || undefined, visitor_phone: form.visitor_phone || undefined, purpose: form.purpose || undefined }),
      });
      toast.push(`${form.visitor_name.trim()} checked in · pass ${res.pass_no}`, "success");
      setForm({ ...form, visitor_name: "", visitor_phone: "", whom_to_meet: "", purpose: "" });
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (id: string) => {
    const v = visitors.find((x) => x.id === id);
    if (!(await confirmAction({
      title: v ? `Check out ${v.visitorName}?` : "Check out this visitor?",
      text: v ? `Pass ${v.passNo} · records the exit time now.` : "Records the exit time now.",
      confirmText: "Check out",
      tone: "primary",
    }))) return;
    try {
      await apiFetch(`/api/hostel/visitors/${id}/checkout`, { method: "PUT" });
      toast.push(v ? `${v.visitorName} checked out` : "Visitor checked out", "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const time = (iso: string) => iso.replace("T", " ").slice(0, 16);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {canDesk && (
        <Card className="p-4 max-md:[&>.card-head]:!px-0 max-md:[&>.card-head]:!pt-0 max-md:[&>.card-head]:mb-3">
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
            <Button variant="primary" loading={busy} disabled={!form.visitor_name.trim() || !form.whom_to_meet.trim()} onClick={checkIn} className="max-md:w-full">Check in</Button>
          </div>
        </Card>
      )}
      <Card className={`p-4 max-md:[&>.card-head]:!px-0 max-md:[&>.card-head]:!pt-0 max-md:[&>.card-head]:mb-3 ${canDesk ? "lg:col-span-2" : "lg:col-span-3"}`}>
        <CardHead
          title="Visitor log"
          icon="discipline"
          subtitle={`${visitors.filter((v) => !v.outTime).length} inside now`}
          actions={
            <Select aria-label="Filter visitors by hostel" className="field w-auto max-md:!w-full" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All hostels</option>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          }
        />
        {visitors.length === 0 ? <EmptyState title="No visitors" icon="discipline" /> : (
          <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1 text-sm max-md:max-h-none max-md:overflow-visible max-md:pr-0">
            {visitors.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2/70 px-3 py-2 max-md:block max-md:border max-md:border-line max-md:bg-surface max-md:p-4">
                {/* Phones: a visitor card — who, status, then aligned details and the action. */}
                <div className="md:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug text-ink">{v.visitorName}</p>
                      {v.visitorPhone && <PhoneLink value={v.visitorPhone} className="text-[13px]" />}
                    </div>
                    {v.outTime ? <Badge tone="slate">Left</Badge> : <Badge tone="amber">Inside</Badge>}
                  </div>
                  <dl className="mt-3 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[13px]">
                    <dt className="text-ink-3">Meeting</dt><dd className="break-words font-medium text-ink">{v.whomToMeet}</dd>
                    <dt className="text-ink-3">Hostel</dt><dd className="text-ink-2">{v.hostelName ?? "General"}</dd>
                    <dt className="text-ink-3">Pass</dt><dd className="font-mono text-ink-2">{v.passNo}</dd>
                    <dt className="text-ink-3">In</dt><dd className="tnum text-ink-2">{time(v.inTime)}</dd>
                    {v.outTime && <><dt className="text-ink-3">Out</dt><dd className="tnum text-ink-2">{time(v.outTime)}</dd></>}
                    {v.purpose && <><dt className="text-ink-3">Purpose</dt><dd className="break-words text-ink-2">{v.purpose}</dd></>}
                  </dl>
                  {!v.outTime && canDesk && (
                    <Button onClick={() => checkout(v.id)} className="mt-3 w-full">Check out</Button>
                  )}
                </div>
                <div className="contents max-md:hidden">
                <div className="min-w-0 max-md:break-words">
                  <span className="font-semibold max-md:block">{v.visitorName}</span>{" "}
                  {v.visitorPhone && <PhoneLink value={v.visitorPhone} className="text-xs max-md:block max-md:w-fit" />}{" "}
                  <span className="text-xs text-ink-2 max-md:block max-md:break-words">→ {v.whomToMeet}</span>
                  <div className="text-xs text-ink-3">
                    {v.hostelName ?? "General"} · Pass {v.passNo} · in {time(v.inTime)}{v.outTime ? ` · out ${time(v.outTime)}` : ""}{v.purpose ? ` · ${v.purpose}` : ""}
                  </div>
                </div>
                {v.outTime ? <Badge tone="slate">Left</Badge> : canDesk ? <Button size="sm" onClick={() => checkout(v.id)} className="max-md:shrink-0 max-md:!min-h-11">Check out</Button> : <Badge tone="amber">Inside</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
