import Swal from "sweetalert2";

export type NoticeAudience = "all_students" | "class" | "student";

export type StaffNotice = {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  priority: "normal" | "important";
  class_id: string | null;
  class_name: string | null;
  student_id: string | null;
  student_name: string | null;
  student_admission_no: string | null;
  created_at: string;
  expires_at: string | null;
  expired: boolean;
  created_by: { name: string; role: string } | null;
  read_count: number;
  audience_size: number;
  can_manage: boolean;
};

export type PortalNotice = {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  audience_label: string;
  priority: "normal" | "important";
  created_at: string;
  expires_at: string | null;
  from: { name: string; role: string } | null;
  children: { id: string; name: string }[];
  read: boolean;
  read_at: string | null;
};

export type NoticeTargets = { school_wide: boolean; classes: { id: string; name: string }[] };

export type NoticeDelivery = {
  channel: string; dispatched: number; sent: number; failed: number; mocked: number; skipped: number;
} | null;

export const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  all_students: "All students",
  class: "Class",
  student: "One student",
};

const cssVar = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

/** Navy-themed SweetAlert confirm. Resolves true when confirmed. */
export async function confirmAction(opts: { title: string; text: string; confirm: string; danger?: boolean }) {
  const r = await Swal.fire({
    title: opts.title,
    text: opts.text,
    icon: opts.danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: opts.confirm,
    cancelButtonText: "Cancel",
    reverseButtons: true,
    focusCancel: !!opts.danger,
    confirmButtonColor: opts.danger ? cssVar("--color-danger", "#b42318") : cssVar("--color-brand-700", "#142b4a"),
    cancelButtonColor: cssVar("--color-ink-3", "#64748b"),
  });
  return r.isConfirmed;
}
