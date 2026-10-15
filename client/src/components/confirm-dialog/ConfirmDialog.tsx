/* ConfirmDialog — accessible replacement for window.confirm, built on the
   @devdigest/ui Modal. Callers pass already-translated labels; the cancel label
   defaults to common.actions.cancel. Escape cancels. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive action: confirm renders as a danger button and focus starts on Cancel. */
  danger?: boolean;
  /** Disables both buttons while the confirmed action is in flight. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const BODY_STYLE: React.CSSProperties = {
  padding: "16px 24px",
  fontSize: 13.5,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};
const FOOTER_STYLE: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8 };
const WIDTH = 440;

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations("common");

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Modal
      width={WIDTH}
      title={title}
      onClose={onCancel}
      footer={
        <div style={FOOTER_STYLE}>
          <Button kind="ghost" size="sm" type="button" autoFocus={danger} disabled={pending} onClick={onCancel}>
            {cancelLabel ?? t("actions.cancel")}
          </Button>
          <Button
            kind={danger ? "danger" : "primary"}
            size="sm"
            type="button"
            autoFocus={!danger}
            loading={pending}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body != null && <div style={BODY_STYLE}>{body}</div>}
    </Modal>
  );
}
