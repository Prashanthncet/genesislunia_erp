"use client";

import { useEffect, useState } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";

/** Small prompt used for approve/reject remarks and gate-pass rejection reasons. */
export function ReasonModal({
  open, title, subtitle, label = "Remarks", required, confirmLabel, danger, busy, onClose, onConfirm,
}: {
  open: boolean; title: string; subtitle?: string; label?: string; required?: boolean;
  confirmLabel: string; danger?: boolean; busy?: boolean;
  onClose: () => void; onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);
  const blocked = required && !text.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} disabled={blocked} loading={busy} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label} required={required} hint={required ? "Required — the applicant will see this." : "Optional"}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus />
      </Field>
    </Modal>
  );
}
