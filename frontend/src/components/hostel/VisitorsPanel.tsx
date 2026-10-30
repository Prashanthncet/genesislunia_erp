"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Input, Modal, PhoneLink, Select, useToast } from "@/components/ui";
import { Monogram, initials, toneFor } from "@/components/RecordCard";
import { confirmAction } from "@/components/confirm";
import { sanitizePhone, sanitizePersonName, validatePhone, validatePersonName } from "@/lib/validation";
import type { Hostel, Visitor } from "./types";

/** Resize an image source (HTMLVideoElement or HTMLImageElement) to a compact JPEG data URL. */
function captureToDataUrl(source: HTMLVideoElement | HTMLImageElement, width: number, height: number): string {
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function VisitorsPanel({ canDesk }: { canDesk: boolean }) {
  const toast = useToast();
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    hostel_id: "",
    visitor_name: "",
    visitor_phone: "",
    whom_to_meet: "",
    purpose: "",
    visitor_photo: "",
  });
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewVisitor, setPreviewVisitor] = useState<Visitor | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        fileInputRef.current?.click();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      }, 50);
    } catch {
      toast.push("Camera access unavailable — select or take a photo using file upload.", "error");
      fileInputRef.current?.click();
    }
  };

  const takeSnapshot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) {
      toast.push("Camera stream is still initializing — try again in a moment", "error");
      return;
    }
    const dataUrl = captureToDataUrl(v, v.videoWidth, v.videoHeight);
    if (dataUrl) {
      setForm((f) => ({ ...f, visitor_photo: dataUrl }));
    }
    stopCamera();
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.push("Please select a valid image file", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const dataUrl = captureToDataUrl(img, img.naturalWidth || 640, img.naturalHeight || 480);
        if (dataUrl) setForm((f) => ({ ...f, visitor_photo: dataUrl }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

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

  const phoneErr = form.visitor_phone ? validatePhone(form.visitor_phone, false, "Visitor phone") : null;
  const nameErr = form.visitor_name ? validatePersonName(form.visitor_name, true, "Visitor name") : null;

  const checkIn = async () => {
    const vNameErr = validatePersonName(form.visitor_name, true, "Visitor name");
    if (vNameErr) {
      toast.push(vNameErr, "error");
      return;
    }
    if (!form.whom_to_meet.trim()) {
      toast.push("Please enter whom the visitor is meeting", "error");
      return;
    }
    if (form.visitor_phone) {
      const vPhoneErr = validatePhone(form.visitor_phone, false, "Visitor phone");
      if (vPhoneErr) {
        toast.push(vPhoneErr, "error");
        return;
      }
    }
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
        body: JSON.stringify({
          hostel_id: form.hostel_id || undefined,
          visitor_name: form.visitor_name.trim(),
          visitor_phone: form.visitor_phone || undefined,
          whom_to_meet: form.whom_to_meet.trim(),
          purpose: form.purpose || undefined,
          visitor_photo: form.visitor_photo || undefined,
        }),
      });
      toast.push(`${form.visitor_name.trim()} checked in · pass ${res.pass_no}`, "success");
      setForm({ ...form, visitor_name: "", visitor_phone: "", whom_to_meet: "", purpose: "", visitor_photo: "" });
      stopCamera();
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
          <CardHead title="Check in a visitor" icon="discipline" subtitle="Capture visitor/parent photo and record entry." />
          <div className="space-y-2.5">
            <Select aria-label="Hostel visited" value={form.hostel_id} onChange={(e) => setForm({ ...form, hostel_id: e.target.value })}>
              <option value="">Not hostel-specific</option>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
            <Field label="Visitor / parent name" required error={nameErr ?? undefined}>
              <Input
                placeholder="Visitor / parent name (alphabets only)"
                value={form.visitor_name}
                onChange={(e) => setForm({ ...form, visitor_name: sanitizePersonName(e.target.value) })}
              />
            </Field>
            <Field
              label="Phone (10 digits)"
              error={phoneErr ?? undefined}
              hint={!phoneErr && form.visitor_phone ? `${form.visitor_phone.length}/10 digits` : undefined}
            >
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number (numbers only)"
                value={form.visitor_phone}
                onChange={(e) => setForm({ ...form, visitor_phone: sanitizePhone(e.target.value) })}
              />
            </Field>
            <Field label="Whom to meet" required>
              <Input placeholder="Whom to meet (student / staff) *" value={form.whom_to_meet} onChange={(e) => setForm({ ...form, whom_to_meet: e.target.value })} />
            </Field>
            <Field label="Purpose">
              <Input placeholder="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </Field>

            {/* Visitor / Parent Photo Capture */}
            <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink-2">Visitor / Parent Photo</span>
                {form.visitor_photo && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, visitor_photo: "" }))}
                    className="text-[11.5px] font-semibold text-danger hover:underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={onFileSelect}
                className="hidden"
                aria-label="Upload visitor photo"
              />

              {cameraOpen ? (
                <div className="space-y-2">
                  <div className="relative overflow-hidden rounded-lg border border-line bg-black aspect-[4/3]">
                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="primary" onClick={takeSnapshot} className="flex-1">
                      <Icon name="check" className="h-3.5 w-3.5" /> Capture photo
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={stopCamera}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : form.visitor_photo ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.visitor_photo}
                    alt="Captured visitor preview"
                    className="h-16 w-16 shrink-0 rounded-xl border border-line object-cover shadow-xs"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[12px] font-medium text-ok-ink">Photo captured &amp; linked</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="soft" onClick={startCamera}>
                        Retake
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                        Upload file
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="soft" onClick={startCamera} className="flex-1">
                    <Icon name="user" className="h-3.5 w-3.5" /> Capture camera photo
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                    <Icon name="upload" className="h-3.5 w-3.5" /> Upload
                  </Button>
                </div>
              )}
            </div>

            <Button
              variant="primary"
              loading={busy}
              disabled={!form.visitor_name.trim() || !form.whom_to_meet.trim() || !!phoneErr || !!nameErr}
              onClick={checkIn}
              className="w-full"
            >
              Verify &amp; Check in visitor
            </Button>
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
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1 text-sm max-md:max-h-none max-md:overflow-visible max-md:pr-0">
            {visitors.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/70 px-3.5 py-2.5 max-md:block max-md:border max-md:border-line max-md:bg-surface max-md:p-4">
                <div className="md:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {v.visitorPhoto ? (
                        <button type="button" onClick={() => setPreviewVisitor(v)} className="shrink-0 focus:outline-none">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.visitorPhoto} alt={v.visitorName} className="h-12 w-12 rounded-xl border border-line object-cover shadow-xs" />
                        </button>
                      ) : (
                        <Monogram text={initials(v.visitorName)} tone={toneFor(v.visitorName)} shape="circle" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-snug text-ink">{v.visitorName}</p>
                        {v.visitorPhone && <PhoneLink value={v.visitorPhone} className="text-[13px]" />}
                      </div>
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
                  <div className="flex items-center gap-3 min-w-0">
                    {v.visitorPhoto ? (
                      <button
                        type="button"
                        onClick={() => setPreviewVisitor(v)}
                        title="View captured visitor photo"
                        className="group relative shrink-0 overflow-hidden rounded-xl border border-line shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.visitorPhoto} alt={v.visitorName} className="h-11 w-11 object-cover transition-transform group-hover:scale-105" />
                      </button>
                    ) : (
                      <Monogram text={initials(v.visitorName)} tone={toneFor(v.visitorName)} size="sm" shape="circle" />
                    )}
                    <div className="min-w-0">
                      <div>
                        <span className="font-semibold text-ink">{v.visitorName}</span>{" "}
                        {v.visitorPhone && <PhoneLink value={v.visitorPhone} className="text-xs" />}{" "}
                        <span className="text-xs text-ink-2">→ {v.whomToMeet}</span>
                      </div>
                      <div className="text-xs text-ink-3">
                        {v.hostelName ?? "General"} · Pass {v.passNo} · in {time(v.inTime)}{v.outTime ? ` · out ${time(v.outTime)}` : ""}{v.purpose ? ` · ${v.purpose}` : ""}
                        {v.visitorPhoto && (
                          <button type="button" onClick={() => setPreviewVisitor(v)} className="ml-2 font-medium text-brand-700 hover:underline">
                            Photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {v.outTime ? <Badge tone="slate">Left</Badge> : canDesk ? <Button size="sm" onClick={() => checkout(v.id)} className="max-md:shrink-0 max-md:!min-h-11">Check out</Button> : <Badge tone="amber">Inside</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={previewVisitor !== null}
        onClose={() => setPreviewVisitor(null)}
        title={previewVisitor ? `Visitor · ${previewVisitor.visitorName}` : "Visitor photo"}
        subtitle={previewVisitor ? `Pass ${previewVisitor.passNo} · Meeting ${previewVisitor.whomToMeet}` : ""}
        size="sm"
        footer={<Button onClick={() => setPreviewVisitor(null)}>Close</Button>}
      >
        {previewVisitor?.visitorPhoto && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewVisitor.visitorPhoto} alt={previewVisitor.visitorName} className="max-h-96 w-full object-contain" />
            </div>
            <p className="text-[12.5px] text-ink-3">
              Checked in at {time(previewVisitor.inTime)}{previewVisitor.hostelName ? ` · ${previewVisitor.hostelName}` : ""}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
