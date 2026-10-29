"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Icon, Input, Modal } from "@/components/ui";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue?: string }[]>;
};

/**
 * Live camera + image + manual QR / Code scanner modal.
 * Uses the browser's native BarcodeDetector({ formats: ['qr_code'] }) when available,
 * supports uploading a QR screenshot/image, and provides an instant manual/paste input
 * for QR URLs, tokens (tok_...), pass codes (GP-...), or admission numbers.
 */
export function QrScannerModal({
  open,
  onClose,
  onScan,
  title = "Scan QR Code",
  subtitle = "Point your camera at an Admission Form QR, Gate Pass QR, or Student ID QR code, or paste the code below.",
  placeholder = "Paste scanned URL, token (tok_...), pass code (GP-...), or ID…",
}: {
  open: boolean;
  onClose: () => void;
  onScan: (rawValue: string) => void;
  title?: string;
  subtitle?: string;
  placeholder?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [detectorSupported, setDetectorSupported] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const handleDetected = useCallback(
    (raw: string) => {
      const cleaned = raw.trim();
      if (!cleaned) return;
      stopCamera();
      onScan(cleaned);
      onClose();
    },
    [onClose, onScan, stopCamera],
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser. Paste or type the code below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      const Win = window as unknown as { BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike };
      const hasDetector = typeof Win.BarcodeDetector === "function";
      setDetectorSupported(hasDetector);

      setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().catch(() => undefined);

        if (hasDetector && Win.BarcodeDetector) {
          const detector = new Win.BarcodeDetector({ formats: ["qr_code"] });
          const tick = async () => {
            if (!videoRef.current || !streamRef.current) return;
            try {
              if (videoRef.current.readyState >= 2) {
                const hits = await detector.detect(videoRef.current);
                if (hits && hits.length > 0 && hits[0]?.rawValue) {
                  handleDetected(hits[0].rawValue);
                  return;
                }
              }
            } catch {
              // continue scanning frame
            }
            rafRef.current = requestAnimationFrame(() => void tick());
          };
          rafRef.current = requestAnimationFrame(() => void tick());
        }
      }, 80);
    } catch {
      setCameraError("Could not access camera. Please allow camera permission or enter the code manually below.");
    }
  }, [handleDetected]);

  useEffect(() => {
    if (open) {
      setManualValue("");
      void startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const onImageUpload = async (file: File | undefined) => {
    if (!file) return;
    const Win = window as unknown as { BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike };
    if (typeof Win.BarcodeDetector !== "function") {
      setCameraError("Image QR decoding requires Chromium/mobile browser support. Please paste the code below.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new Win.BarcodeDetector({ formats: ["qr_code"] });
      const hits = await detector.detect(bitmap);
      if (hits && hits.length > 0 && hits[0]?.rawValue) {
        handleDetected(hits[0].rawValue);
      } else {
        setCameraError("No QR code detected in the uploaded image.");
      }
    } catch {
      setCameraError("Could not decode QR code from image.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={title}
      subtitle={subtitle}
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              stopCamera();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!manualValue.trim()}
            onClick={() => handleDetected(manualValue)}
          >
            <Icon name="check" className="h-4 w-4" /> Verify &amp; Open
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {cameraActive ? (
          <div className="relative overflow-hidden rounded-2xl border-2 border-brand-500 bg-black aspect-[4/3]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-44 w-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
            </div>
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between rounded-xl bg-navy-950/80 px-3 py-2 text-xs text-white backdrop-blur-xs">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
                {detectorSupported ? "Camera active — point at QR code" : "Camera preview active"}
              </span>
              <button type="button" onClick={stopCamera} className="font-semibold text-brand-200 hover:text-white">
                Stop camera
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 p-3.5">
            <div className="flex items-center gap-2.5 text-xs text-ink-2">
              <Icon name="qr" className="h-5 w-5 text-brand-700" />
              <span>{cameraError ?? "Camera paused. Start camera or upload a QR image."}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="soft" onClick={() => void startCamera()}>
                Start Camera
              </Button>
              <label className="btn-soft cursor-pointer !px-3 !py-1.5 text-xs">
                Upload QR Image
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    void onImageUpload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        )}

        <Field
          label="Or paste / enter QR link, token, or pass code"
          hint="Supports full admission URLs (?token=...), tokens (tok_...), gate pass codes (GP-...), or student admission numbers."
        >
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualValue.trim()) {
                e.preventDefault();
                handleDetected(manualValue);
              }
            }}
            placeholder={placeholder}
          />
        </Field>
      </div>
    </Modal>
  );
}
