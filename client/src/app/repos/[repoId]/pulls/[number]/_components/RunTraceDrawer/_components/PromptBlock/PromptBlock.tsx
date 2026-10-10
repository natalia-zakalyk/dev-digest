/* PromptBlock — one labelled, collapsible prompt segment with copy + fullscreen
   actions; fullscreen opens PromptModalBody in a Modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal } from "@devdigest/ui";
import { s } from "../../styles";
import { PromptModalBody } from "../PromptModalBody";

export function PromptBlock({ label, text, color }: { label: string; text: string; color: string }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const preId = React.useId();
  const copy = () => {
    void navigator.clipboard?.writeText(text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div style={s.promptRow}>
      <div style={s.promptHead}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={preId}
          onClick={() => setOpen((o) => !o)}
          style={s.promptToggleBtn}
        >
          <span style={s.promptDot(color)} />
          <span style={s.promptLabel}>{label}</span>
          <span style={s.promptToggle}>{open ? t("trace.collapse") : t("trace.expand")}</span>
        </button>
        <button
          type="button"
          title={t("trace.prompt.copy")}
          aria-label={t("trace.prompt.copy")}
          onClick={copy}
          style={s.promptMiniBtn}
        >
          {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
        </button>
        <button
          type="button"
          title={t("trace.prompt.fullscreen")}
          aria-label={t("trace.prompt.fullscreen")}
          onClick={() => setFull(true)}
          style={s.promptMiniBtn}
        >
          <Icon.ExternalLink size={12} />
        </button>
      </div>
      {open && (
        <pre id={preId} className="mono" style={s.promptPre}>
          {text || "—"}
        </pre>
      )}
      {full && (
        <Modal
          width={1200}
          title={label}
          onClose={() => setFull(false)}
          footer={
            <Button kind="secondary" size="sm" icon={copied ? "Check" : "Copy"} onClick={copy}>
              {copied ? t("drawer.copied") : t("trace.prompt.copy")}
            </Button>
          }
        >
          <PromptModalBody text={text} />
        </Modal>
      )}
    </div>
  );
}
