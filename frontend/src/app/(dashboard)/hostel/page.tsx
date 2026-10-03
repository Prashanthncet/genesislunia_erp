"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Icon, PageHeader, PhoneLink, ProgressBar, Reveal, StatCard, useToast } from "@/components/ui";

type Hostel = { id: string; name: string; capacity: number; rooms: Array<{ id: string; _count: { allocations: number } }> };
type Room = { id: string; hostelId: string; roomNumber: string; capacity: number; hostel: { name: string }; _count: { allocations: number } };
type Allocation = { id: string; student: { id: string; fullName: string; admissionNo: string }; room: { roomNumber: string; hostel: { name: string } } };
type Visitor = { id: string; visitorName: string; visitorPhone: string | null; whomToMeet: string; purpose: string | null; inTime: string; outTime: string | null; passNo: string };
type Student = { id: string; fullName: string; admissionNo: string };

export default function HostelPage() {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!message) return;
    toast.push(message, /fail|error|required|invalid|select/i.test(message) ? "error" : "success");
    setMessage("");
  }, [message, toast]);

  // hostel form
  const [hName, setHName] = useState("");
  const [hCap, setHCap] = useState("");
  // room form
  const [rHostel, setRHostel] = useState("");
  const [rNumber, setRNumber] = useState("");
  const [rCap, setRCap] = useState("");
  // allocation
  const [allocStudent, setAllocStudent] = useState("");
  const [allocRoom, setAllocRoom] = useState("");
  // visitor
  const [vName, setVName] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vMeet, setVMeet] = useState("");
  const [vPurpose, setVPurpose] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, r, a, v] = await Promise.all([
        apiFetch<Hostel[]>("/api/hostel"),
        apiFetch<Room[]>("/api/hostel/rooms"),
        apiFetch<Allocation[]>("/api/hostel/allocations"),
        apiFetch<Visitor[]>("/api/hostel/visitors"),
      ]);
      setHostels(h ?? []);
      setRooms(r ?? []);
      setAllocations(a ?? []);
      setVisitors(v ?? []);
      if (r?.length && !rHostel) setRHostel(r[0].hostelId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch<{ data: Student[] }>("/api/students?page_size=200")
      .then((res) => setStudents(res.data ?? []))
      .catch(() => undefined);
  }, []);

  const createHostel = async () => {
    if (!hName || !hCap) return setMessage("Name and capacity are required");
    setLoading(true);
    try {
      await apiFetch("/api/hostel", { method: "POST", body: JSON.stringify({ name: hName, capacity: Number(hCap) }) });
      setHName(""); setHCap("");
      await load();
      setMessage("Hostel created ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const createRoom = async () => {
    if (!rHostel || !rNumber || !rCap) return setMessage("Hostel, room number and capacity are required");
    setLoading(true);
    try {
      await apiFetch("/api/hostel/rooms", { method: "POST", body: JSON.stringify({ hostel_id: rHostel, room_number: rNumber, capacity: Number(rCap) }) });
      setRNumber(""); setRCap("");
      await load();
      setMessage("Room created ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const allocate = async () => {
    if (!allocStudent || !allocRoom) return setMessage("Student and room are required");
    setLoading(true);
    try {
      await apiFetch("/api/hostel/allocations", { method: "POST", body: JSON.stringify({ student_id: allocStudent, room_id: allocRoom }) });
      setAllocStudent(""); setAllocRoom("");
      await load();
      setMessage("Student allocated ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const autoAllocate = async () => {
    if (!allocStudent) return setMessage("Select a student first");
    setLoading(true);
    try {
      const res = await apiFetch<{ room_number: string }>("/api/hostel/allocations/auto", { method: "POST", body: JSON.stringify({ student_id: allocStudent }) });
      setAllocStudent("");
      await load();
      setMessage(`Auto-allocated to room ${res.room_number} ✓`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const deallocate = async (id: string) => {
    try { await apiFetch(`/api/hostel/allocations/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const addVisitor = async () => {
    if (!vName || !vMeet) return setMessage("Visitor name and whom to meet are required");
    setLoading(true);
    try {
      await apiFetch("/api/hostel/visitors", { method: "POST", body: JSON.stringify({ visitor_name: vName, visitor_phone: vPhone || undefined, whom_to_meet: vMeet, purpose: vPurpose || undefined }) });
      setVName(""); setVPhone(""); setVMeet(""); setVPurpose("");
      await load();
      setMessage("Visitor checked in ✓");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  };

  const checkoutVisitor = async (id: string) => {
    try { await apiFetch(`/api/hostel/visitors/${id}/checkout`, { method: "PUT" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Failed"); }
  };

  const occupancy = hostels.reduce((sum, h) => sum + h.rooms.reduce((s, r) => s + r._count.allocations, 0), 0);
  const capacity = hostels.reduce((sum, h) => sum + h.capacity, 0);

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="hostel"
          title="Hostel"
          subtitle="Hostels, rooms, bed allocation and the visitor log."
        />
      </Reveal>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal delay={40}>
          <StatCard label="Hostels" value={hostels.length} tone="brand" icon="hostel" />
        </Reveal>
        <Reveal delay={80}>
          <StatCard label="Rooms" value={rooms.length} tone="teal" icon="timetable" />
        </Reveal>
        <Reveal delay={120}>
          <StatCard label="Occupied Beds" value={occupancy} tone="violet" icon="students" />
        </Reveal>
        <Reveal delay={160}>
          <StatCard label="Visitors Inside" value={visitors.filter((v) => !v.outTime).length} tone="amber" icon="discipline" />
        </Reveal>
      </div>

      <Reveal delay={60}>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">Bed occupancy</span>
            <span className="tnum text-slate-500">{occupancy} / {capacity} beds</span>
          </div>
          <ProgressBar value={capacity ? (occupancy / capacity) * 100 : 0} tone={capacity && occupancy / capacity > 0.95 ? "rose" : "brand"} />
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Hostels & rooms */}
        <Reveal delay={80} className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="hostel" className="h-4 w-4 text-brand-600" /> Hostels
            </h3>
            <div className="mb-3 flex flex-wrap gap-2">
              <input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Hostel name" className="field w-auto" />
              <input value={hCap} onChange={(e) => setHCap(e.target.value)} type="number" placeholder="Capacity" className="field w-24" />
              <Button variant="primary" onClick={createHostel} loading={loading}>Add</Button>
            </div>
            <ul className="space-y-1 text-sm">
              {hostels.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-xl bg-slate-50/70 px-3 py-2 transition-colors duration-200 hover:bg-brand-50/60">
                  <span className="font-semibold">{h.name}</span>
                  <span className="text-xs text-slate-500">{h.rooms.length} room(s) · cap {h.capacity}</span>
                </li>
              ))}
              {hostels.length === 0 && <li className="py-4 text-center text-slate-400">{loading ? "Loading…" : "No hostels yet."}</li>}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="timetable" className="h-4 w-4 text-teal-500" /> Rooms
            </h3>
            <div className="mb-3 flex flex-wrap gap-2">
              <select value={rHostel} aria-label="Hostel" onChange={(e) => setRHostel(e.target.value)} className="field w-auto">
                {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <input value={rNumber} onChange={(e) => setRNumber(e.target.value)} placeholder="Room no" className="field w-24" />
              <input value={rCap} onChange={(e) => setRCap(e.target.value)} type="number" placeholder="Beds" className="field w-20" />
              <Button variant="primary" onClick={createRoom} loading={loading}>Add</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {rooms.map((r) => (
                <div key={r.id} className="rounded-xl bg-slate-50/70 px-3 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50/60 hover:shadow-soft">
                  <div className="font-semibold">{r.roomNumber}</div>
                  <div className="text-xs text-slate-500">{r.hostel.name} · {r._count.allocations}/{r.capacity}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Allocations & visitors */}
        <Reveal delay={120} className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Icon name="students" className="h-4 w-4 text-violet-500" /> Allocations
              </h3>
              <span className="text-xs text-slate-500">Occupancy {occupancy}/{capacity}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <select value={allocStudent} aria-label="Student" onChange={(e) => setAllocStudent(e.target.value)} className="field w-auto">
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo})</option>)}
              </select>
              <select value={allocRoom} aria-label="Room" onChange={(e) => setAllocRoom(e.target.value)} className="field w-auto">
                <option value="">Select room…</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.hostel.name} · {r.roomNumber} ({r.capacity - r._count.allocations} free)</option>)}
              </select>
              <Button variant="primary" onClick={allocate} loading={loading}>Allocate</Button>
              <Button variant="accent" onClick={autoAllocate} loading={loading}>
                <Icon name="spark" className="h-4 w-4" /> Auto
              </Button>
            </div>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm">
              {allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl bg-slate-50/70 px-3 py-2 transition-colors duration-200 hover:bg-brand-50/60">
                  <span>{a.student.fullName} → <b>{a.room.hostel.name} {a.room.roomNumber}</b></span>
                  <button onClick={() => deallocate(a.id)} className="btn-danger !px-2.5 !py-1 text-xs">Remove</button>
                </li>
              ))}
              {allocations.length === 0 && <li className="py-4 text-center text-slate-400">No allocations yet.</li>}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Icon name="discipline" className="h-4 w-4 text-accent-600" /> Visitor Log
            </h3>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Visitor name *" className="field w-auto" />
              <input value={vPhone} onChange={(e) => setVPhone(e.target.value)} placeholder="Phone" className="field w-auto" />
              <input value={vMeet} onChange={(e) => setVMeet(e.target.value)} placeholder="Whom to meet *" className="field w-auto" />
              <input value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} placeholder="Purpose" className="field w-auto" />
            </div>
            <Button variant="primary" onClick={addVisitor} loading={loading} className="mb-3">
              <Icon name="check" className="h-4 w-4" /> Check In
            </Button>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm">
              {visitors.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50/70 px-3 py-2 transition-colors duration-200 hover:bg-brand-50/60">
                  <div>
                    <span className="font-semibold">{v.visitorName}</span>{" "}
                    {v.visitorPhone && <PhoneLink value={v.visitorPhone} className="text-xs" />}{" "}
                    <span className="text-xs text-slate-500">→ {v.whomToMeet}</span>
                    <div className="text-xs text-slate-400">Pass {v.passNo} · {v.outTime ? "out " + v.outTime.slice(11, 16) : "inside"}</div>
                  </div>
                  {!v.outTime && (
                    <Badge tone="amber" className="shrink-0">
                      <button onClick={() => checkoutVisitor(v.id)} className="cursor-pointer">Check Out</button>
                    </Badge>
                  )}
                  {!!v.outTime && <Badge tone="slate" className="shrink-0">Left {v.outTime.slice(11, 16)}</Badge>}
                </li>
              ))}
              {visitors.length === 0 && <li className="py-4 text-center text-slate-400">No visitors today.</li>}
            </ul>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
