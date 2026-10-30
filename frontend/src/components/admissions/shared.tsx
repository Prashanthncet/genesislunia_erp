"use client";

import { BASE, apiFetch } from "@/lib/api";

export type TemplateField = {
  id: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  validationRule: string | null;
  status: string;
  academicYear: string | null;
  sortOrder: number;
  reviewRemarks: string | null;
};

export type TemplateSummary = {
  academic_year: string;
  status: "Draft" | "Pending Approval" | "Published" | "Rejected";
  field_count: number;
  review_remarks: string | null;
  reviewed_at: string | null;
};

export type Application = {
  id: string;
  studentName: string | null;
  parentName: string | null;
  parentEmail: string | null;
  parentContact: string | null;
  status: string;
  paymentStatus: string;
  rollNo: string | null;
  house: string | null;
  remarks: string | null;
  loginId: string | null;
  academicYear: string | null;
  classId: string | null;
  linkExpiresAt: string | null;
  submittedAt: string | null;
  feeAmount: number | null;
  paymentRef: string | null;
  receiptNo: string | null;
  signatureName: string | null;
  signedAt: string | null;
  studentId: string | null;
  updatedAt: string;
  class: { id: string; name: string; section: string | null } | null;
  _count?: { documents: number };
};

export type BadgeTone = "slate" | "emerald" | "amber" | "rose" | "sky" | "violet" | "brand" | "teal";

export const STATUS_TONE: Record<string, BadgeTone> = {
  "Links Sent": "slate",
  "Link Expired": "rose",
  "Submitted by Parent": "sky",
  "Re-submit": "amber",
  "Document Validated": "sky",
  "Payment Received": "teal",
  "Fee Approved": "teal",
  "Roll No Assigned": "violet",
  "VP Approved": "violet",
  "Admission Confirmed": "brand",
  "Admission Complete": "emerald",
  Rejected: "rose",
  Draft: "slate",
  "Pending Approval": "amber",
  Published: "emerald",
};

/** Workflow order used for the progress meter. */
export const PIPELINE = [
  "Links Sent",
  "Submitted by Parent",
  "Document Validated",
  "Payment Received",
  "Fee Approved",
  "Roll No Assigned",
  "VP Approved",
  "Admission Confirmed",
  "Admission Complete",
];

export function stageOf(status: string): number {
  const alias: Record<string, string> = { "Re-submit": "Submitted by Parent", "Link Expired": "Links Sent" };
  return Math.max(0, PIPELINE.indexOf(alias[status] ?? status));
}

/** Academic year label, April–March session: Oct 2026 → 2026-27. */
export function currentAcademicYear(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function shiftYear(year: string, by: number): string {
  const y = parseInt(year.slice(0, 4), 10) + by;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export const FIELD_TYPES = ["text", "number", "date", "email", "phone", "select", "textarea"];

export const MAX_UPLOAD = 5 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** File → data URL with the same type/size rules the backend enforces. */
export function readUpload(file: File): Promise<string> {
  if (!UPLOAD_TYPES.includes(file.type)) return Promise.reject(new Error("Only JPEG, PNG, WebP or PDF files are allowed"));
  if (file.size > MAX_UPLOAD) return Promise.reject(new Error("File too large (max 5 MB)"));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

/**
 * Download descriptor from the documents endpoints: a short-lived signed URL (`url`, relative
 * `/api/files/...` for the local driver or an absolute presigned S3/R2 URL). Only rows not yet
 * moved into storage still come back with an inline `data_url` and `url: null`.
 */
export type DocLink = {
  id: string;
  file_name: string;
  mime_type: string | null;
  url: string | null;
  expires_at: string | null;
  data_url?: string | null;
};

/** Browser-usable href for a DocLink (null when the document has no content). */
export function docHref(link: DocLink): string | null {
  if (link.url) return link.url.startsWith("/") ? `${BASE}${link.url}` : link.url;
  return link.data_url ?? null;
}

export const post = <T = unknown,>(path: string, body: object = {}) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Ensures the admission form link always resolves to the current browser origin
 * (preventing any hardcoded or stale backend FRONTEND_URL from opening wrong domains).
 */
export function resolveFormLink(link: string | null | undefined): string {
  if (!link) return "";
  try {
    const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    if (link.startsWith("/")) return origin + link;
    const url = new URL(link);
    if (origin) {
      return origin + url.pathname + url.search;
    }
    return link;
  } catch {
    return link;
  }
}
