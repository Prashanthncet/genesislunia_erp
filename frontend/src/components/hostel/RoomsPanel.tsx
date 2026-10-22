"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, R, useMe } from "@/lib/auth";
import { Badge, Button, Card, CardHead, EmptyState, Field, IconButton, Input, Modal, ProgressBar, Select, StatCard, useToast } from "@/components/ui";
import { classLabel, type Bed, type Hostel, type Room, type StudentLite } from "./types";

type Staff = { id: string; name: string };
type BedAction = { room: Room; bed: Bed } | null;

const err = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

/** Hostels → rooms → bed map. Free beds allocate; occupied beds move or vacate. */
export function RoomsPanel({ canAdmin }: { canAdmin: boolean }) {
  const { me } = useMe();
  // The warden picker needs the staff directory; wardens can run the hostel but not read it.
  const canListStaff = hasRole(me, R.STAFF_DIRECTORY);
  const toast = useToast();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unallocated, setUnallocated] = useState<StudentLite[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [action, setAction] = useState<BedAction>(null);
  const [pickStudent, setPickStudent] = useState("");
  const [moveRoom, setMoveRoom] = useState("");
  const [moveBed, setMoveBed] = useState("");
  const [hForm, setHForm] = useState({ name: "", warden_id: "" });
  const [rForm, setRForm] = useState({ hostel_id: "", room_number: "", capacity: "4" });
  const [autoStudent, setAutoStudent] = useState("");
  const [resize, setResize] = useState<{ room: Room; capacity: string } | null>(null);
  const [outReason, setOutReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [h, r] = await Promise.all([apiFetch<Hostel[]>("/api/hostel"), apiFetch<Room[]>("/api/hostel/rooms")]);
      setHostels(h);
      setRooms(r);
      setRForm((f) => (f.hostel_id || !h[0] ? f : { ...f, hostel_id: h[0].id }));
      if (canAdmin) setUnallocated(await apiFetch<StudentLite[]>("/api/hostel/unallocated-students"));
    } catch (e) {
      toast.push(err(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (canAdmin && canListStaff) apiFetch<Staff[]>("/api/staff?active=true").then(setStaff).catch(() => setStaff([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin, canListStaff]);

  const shown = useMemo(() => rooms.filter((r) => !filter || r.hostelId === filter), [rooms, filter]);
  const totals = useMemo(() => {
    const list = filter ? hostels.filter((h) => h.id === filter) : hostels;
    return { capacity: list.reduce((s, h) => s + h.capacity, 0), occupied: list.reduce((s, h) => s + h.occupied, 0) };
  }, [hostels, filter]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.push(ok, "success");
      setAction(null);
      await load();
    } catch (e) {
      toast.push(err(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const post = (path: string, body: object, method = "POST") => apiFetch(path, { method, body: JSON.stringify(body) });

  const openBed = (room: Room, bed: Bed) => {
    if (!canAdmin) return;
    setAction({ room, bed });
    setPickStudent("");
    setMoveRoom(room.id);
    setMoveBed("");
    setOutReason("");
  };

  const setBedActive = (bed: Bed, isActive: boolean) =>
    run(() => post(`/api/hostel/beds/${bed.id}`, { is_active: isActive, reason: outReason.trim() || undefined }, "PUT"),
      isActive ? `Bed ${bed.label} back in service` : `Bed ${bed.label} marked out of service`);

  const moveTarget = rooms.find((r) => r.id === moveRoom);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Hostels" value={hostels.length} tone="brand" icon="hostel" />
        <StatCard label="Rooms" value={shown.length} tone="teal" icon="timetable" />
        <StatCard label="Bed capacity" value={totals.capacity} hint="active beds across rooms" tone="violet" icon="students" />
        <StatCard label="Free beds" value={Math.max(0, totals.capacity - totals.occupied)} tone="amber" icon="check" />
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-2">Bed occupancy</span>
          <span className="tnum text-ink-2">{totals.occupied} / {totals.capacity} beds</span>
        </div>
        <ProgressBar value={totals.capacity ? (totals.occupied / totals.capacity) * 100 : 0} tone={totals.capacity && totals.occupied / totals.capacity > 0.95 ? "rose" : "brand"} />
      </Card>

      {canAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-4">
            <CardHead title="Add hostel" icon="hostel" />
            <div className="space-y-2">
              <Input placeholder="Hostel name" value={hForm.name} onChange={(e) => setHForm({ ...hForm, name: e.target.value })} />
              <Select aria-label="Warden" value={hForm.warden_id} onChange={(e) => setHForm({ ...hForm, warden_id: e.target.value })}>
                <option value="">No warden</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Button variant="primary" loading={busy} disabled={!hForm.name.trim()}
                onClick={() => run(() => post("/api/hostel", { name: hForm.name, warden_id: hForm.warden_id || undefined }), "Hostel created").then(() => setHForm({ name: "", warden_id: "" }))}>
                Add hostel
              </Button>
            </div>
          </Card>
          <Card className="p-4">
            <CardHead title="Add room" icon="timetable" subtitle="Beds are numbered B1..Bn" />
            <div className="space-y-2">
              <Select aria-label="Hostel for new room" value={rForm.hostel_id} onChange={(e) => setRForm({ ...rForm, hostel_id: e.target.value })}>
                {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
              <div className="flex gap-2">
                <Input placeholder="Room no" value={rForm.room_number} onChange={(e) => setRForm({ ...rForm, room_number: e.target.value })} />
                <Input type="number" min={1} max={50} aria-label="Beds" value={rForm.capacity} onChange={(e) => setRForm({ ...rForm, capacity: e.target.value })} className="field w-24" />
              </div>
              <Button variant="primary" loading={busy} disabled={!rForm.hostel_id || !rForm.room_number.trim()}
                onClick={() => run(() => post("/api/hostel/rooms", { ...rForm, capacity: Number(rForm.capacity) }), "Room created").then(() => setRForm({ ...rForm, room_number: "" }))}>
                Add room
              </Button>
            </div>
          </Card>
          <Card className="p-4">
            <CardHead title="Auto-assign" icon="sparkles" subtitle="First free bed in the least-full room" />
            <div className="space-y-2">
              <Select aria-label="Student to auto-assign" value={autoStudent} onChange={(e) => setAutoStudent(e.target.value)}>
                <option value="">Select student without a bed…</option>
                {unallocated.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo}) {classLabel(s)}</option>)}
              </Select>
              <Button variant="accent" loading={busy} disabled={!autoStudent}
                onClick={() => run(async () => {
                  const r = await post("/api/hostel/allocations/auto", { student_id: autoStudent, hostel_id: filter || undefined }) as { room_number: string; bed_label: string };
                  toast.push(`Placed in ${r.room_number} / ${r.bed_label}`, "success");
                }, "Auto-assigned").then(() => setAutoStudent(""))}>
                Auto-assign{filter ? " in this hostel" : ""}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <CardHead
          title="Rooms & beds"
          icon="hostel"
          subtitle={canAdmin ? "Click a free bed to allocate (or mark it out of service), an occupied bed to move or vacate." : "Read-only view."}
          actions={
            <Select aria-label="Filter by hostel" className="field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All hostels</option>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.occupied}/{h.capacity})</option>)}
            </Select>
          }
        />
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-3">Loading…</p>
        ) : shown.length === 0 ? (
          <EmptyState title="No rooms yet" hint={canAdmin ? "Add a hostel and a room above." : undefined} icon="hostel" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{r.roomNumber}</p>
                    <p className="text-xs text-ink-3">{r.hostel.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.out_of_service > 0 && <Badge tone="slate">{r.out_of_service} out of service</Badge>}
                    <Badge tone={r.free === 0 ? "rose" : r.occupied === 0 ? "emerald" : "amber"}>{r.occupied}/{r.capacity}</Badge>
                    {canAdmin && (
                      <IconButton name="edit" label={`Change beds in ${r.roomNumber}`} variant="ghost"
                        onClick={() => setResize({ room: r, capacity: String(r.capacity) })} />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {r.beds.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={!canAdmin}
                      onClick={() => openBed(r, b)}
                      aria-label={`${r.roomNumber} bed ${b.label}: ${b.student ? b.student.fullName : b.is_active ? "free" : "out of service"}`}
                      className={`rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                        b.student
                          ? "border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100"
                          : !b.is_active
                            ? "border-line bg-surface-2 text-ink-3 line-through decoration-ink-3/60"
                            : "border-dashed border-line bg-surface text-ink-3 hover:border-ok hover:text-ok"
                      } disabled:cursor-default`}
                    >
                      <span className="font-bold">{b.label}</span>{" "}
                      <span className="block truncate">{b.student ? b.student.fullName : b.is_active ? "Free" : "Out of service"}</span>
                    </button>
                  ))}
                </div>
                {!!r.unassigned?.length && (
                  <p className="mt-2 text-xs text-warn">
                    No bed for: {r.unassigned.map((u) => u.student.fullName).join(", ")} — room is over-full; move them.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        size="sm"
        title={action ? `${action.room.roomNumber} · bed ${action.bed.label}` : ""}
        subtitle={action?.bed.student ? `${action.bed.student.fullName} (${action.bed.student.admissionNo})` : action?.bed.is_active ? "Free bed" : "Out of service"}
        footer={action && (action.bed.student ? (
          <>
            <Button variant="danger" loading={busy}
              onClick={() => run(() => apiFetch(`/api/hostel/allocations/${action.bed.allocation_id}`, { method: "DELETE" }), "Bed vacated")}>
              Vacate
            </Button>
            <Button variant="primary" loading={busy} disabled={!moveRoom}
              onClick={() => run(() => post("/api/hostel/allocations", { student_id: action.bed.student!.id, room_id: moveRoom, bed_id: moveBed || undefined }), "Student moved")}>
              Move
            </Button>
          </>
        ) : !action.bed.is_active ? (
          <Button variant="primary" loading={busy} onClick={() => setBedActive(action.bed, true)}>
            Back in service
          </Button>
        ) : (
          <>
            <Button variant="ghost" loading={busy} onClick={() => setBedActive(action.bed, false)}>
              Mark out of service
            </Button>
            <Button variant="primary" loading={busy} disabled={!pickStudent}
              onClick={() => run(() => post("/api/hostel/allocations", { student_id: pickStudent, room_id: action.room.id, bed_id: action.bed.id }), "Bed allocated")}>
              Allocate
            </Button>
          </>
        ))}
      >
        {action && (action.bed.student ? (
          <div className="space-y-3">
            <Field label="Move to room">
              <Select value={moveRoom} onChange={(e) => { setMoveRoom(e.target.value); setMoveBed(""); }}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.hostel.name} · {r.roomNumber} ({r.free} free)</option>)}
              </Select>
            </Field>
            <Field label="Bed" hint="Leave on 'first free' to take the lowest free bed">
              <Select value={moveBed} onChange={(e) => setMoveBed(e.target.value)}>
                <option value="">First free bed</option>
                {moveTarget?.beds.filter((b) => !b.student && b.is_active).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </Select>
            </Field>
          </div>
        ) : !action.bed.is_active ? (
          <p className="text-sm text-ink-2">This bed is out of service and is never offered for allocation. Bring it back once it is usable.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Student" hint="Only students without a bed are listed">
              <Select value={pickStudent} onChange={(e) => setPickStudent(e.target.value)}>
                <option value="">Select student…</option>
                {unallocated.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNo}) {classLabel(s)}</option>)}
              </Select>
            </Field>
            <Field label="Out-of-service reason" hint="Only used if you mark the bed out of service (kept in the audit log)">
              <Input value={outReason} maxLength={200} placeholder="e.g. Broken frame" onChange={(e) => setOutReason(e.target.value)} />
            </Field>
          </div>
        ))}
      </Modal>

      <Modal
        open={!!resize}
        onClose={() => setResize(null)}
        size="sm"
        title={resize ? `Beds in ${resize.room.roomNumber}` : ""}
        subtitle="Raising adds new beds; lowering takes free beds out of service (highest first)."
        footer={resize && (
          <Button variant="primary" loading={busy} disabled={!(Number(resize.capacity) >= 1)}
            onClick={() => run(() => post(`/api/hostel/rooms/${resize.room.id}`, { capacity: Number(resize.capacity) }, "PUT"), "Room updated").then(() => setResize(null))}>
            Save
          </Button>
        )}
      >
        {resize && (
          <Field label="Active beds" hint={`${resize.room.occupied} occupied — cannot go below that`}>
            <Input type="number" min={1} max={50} value={resize.capacity} onChange={(e) => setResize({ ...resize, capacity: e.target.value })} />
          </Field>
        )}
      </Modal>
    </div>
  );
}
