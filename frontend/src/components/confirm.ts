"use client";

import Swal from "sweetalert2";

/**
 * Branded SweetAlert confirmation for every update / delete / irreversible action.
 * Same look as the logout dialog (DashboardShell confirmLogout). Focus starts on Cancel,
 * Escape / backdrop cancel. Resolves true only when the user confirms.
 *
 *   if (!(await confirmAction({ title: "Delete Class 6 A?", text: "This cannot be undone.", confirmText: "Delete", tone: "danger" }))) return;
 */
export async function confirmAction({
  title,
  text,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "primary",
}: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** "danger" for delete / deactivate / reject / archive; "primary" for saves and updates. */
  tone?: "primary" | "danger";
}): Promise<boolean> {
  const res = await Swal.fire({
    title,
    text,
    icon: tone === "danger" ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    focusCancel: true,
    reverseButtons: true,
    allowEscapeKey: true,
    allowOutsideClick: true,
    buttonsStyling: false,
    iconColor: tone === "danger" ? "var(--color-danger)" : "var(--color-brand-700)",
    customClass: {
      popup: "!rounded-panel !border !border-line !bg-surface !shadow-pop",
      title: "!font-display !text-[20px] !font-bold !text-ink",
      htmlContainer: "!text-[13.5px] !text-ink-2",
      actions: "!gap-2",
      confirmButton: tone === "danger" ? "btn-danger" : "btn-primary",
      cancelButton: "btn-soft",
    },
  });
  return res.isConfirmed;
}

/**
 * Confirmation that also asks for a reason/note (e.g. why a student left).
 * When `required: true`, submission is blocked until a non-empty reason is entered.
 * Resolves to the trimmed text, or null when cancelled.
 */
export async function confirmWithReason({
  title,
  text,
  placeholder = "Reason (optional)",
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "primary",
  required = false,
  errorMessage = "Please enter a valid reason before continuing.",
}: {
  title: string;
  text?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "primary" | "danger";
  required?: boolean;
  errorMessage?: string;
}): Promise<string | null> {
  const res = await Swal.fire({
    title,
    text,
    icon: tone === "danger" ? "warning" : "question",
    input: "text",
    inputPlaceholder: placeholder,
    inputAttributes: required ? { required: "true", "aria-required": "true" } : undefined,
    inputValidator: required
      ? (value) => (!String(value ?? "").trim() ? errorMessage : null)
      : undefined,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    allowEscapeKey: true,
    allowOutsideClick: true,
    buttonsStyling: false,
    iconColor: tone === "danger" ? "var(--color-danger)" : "var(--color-brand-700)",
    customClass: {
      popup: "!rounded-panel !border !border-line !bg-surface !shadow-pop",
      title: "!font-display !text-[20px] !font-bold !text-ink",
      htmlContainer: "!text-[13.5px] !text-ink-2",
      input: "field !mx-6 !mt-3 !w-auto",
      validationMessage: "!mx-6 !mt-2 !rounded-lg !bg-danger-soft !px-3 !py-1.5 !text-[12.5px] !font-medium !text-danger",
      actions: "!gap-2",
      confirmButton: tone === "danger" ? "btn-danger" : "btn-primary",
      cancelButton: "btn-soft",
    },
  });
  return res.isConfirmed ? String(res.value ?? "").trim() : null;
}
