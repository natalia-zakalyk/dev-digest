/* FindingsPopover — tooltip with the findings of one severity, under the counters.
   Rendered in a portal with fixed positioning so containers with
   `overflow: hidden` (the PR list table card) don't clip it. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

const WIDTH = 460;
const GUTTER = 16;

const panel = (top: number, left: number): React.CSSProperties => ({
  position: "fixed",
  top,
  left,
  zIndex: 50,
  width: WIDTH,
  maxWidth: `calc(100vw - ${GUTTER * 2}px)`,
  maxHeight: 420,
  overflowY: "auto",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-modal)",
  cursor: "default",
  textAlign: "left",
});

const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  },
  item: { padding: "10px 0", borderTop: "1px solid var(--border)" },
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" },
  metaRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 4 },
  file: { fontSize: 12.5, color: "var(--accent-text)", overflowWrap: "anywhere" },
  rationale: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  muted: { padding: "8px 0", fontSize: 12.5, color: "var(--text-muted)" },
} satisfies Record<string, React.CSSProperties>;

function lineLabel(f: FindingRecord): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export const FindingsPopover = React.forwardRef<
  HTMLDivElement,
  {
    /** Element the popover hangs under. */
    anchor: HTMLElement;
    findings: FindingRecord[] | undefined;
    loading?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  }
>(function FindingsPopover({ anchor, findings, loading, onMouseEnter, onMouseLeave }, ref) {
  const t = useTranslations("common");
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(GUTTER, Math.min(rect.left, window.innerWidth - WIDTH - GUTTER));

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      aria-label={t("findings.popoverLabel")}
      style={panel(rect.bottom + 6, left)}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={s.header}>
        <Icon.AlertOctagon size={13} />
        {findings ? t("findings.title", { count: findings.length }) : t("findings.loading")}
      </div>
      {loading && !findings ? (
        <div style={s.muted}>{t("findings.loading")}</div>
      ) : (findings ?? []).length === 0 ? (
        <div style={s.muted}>{t("findings.empty")}</div>
      ) : (
        findings!.map((f) => (
          <div key={f.id} style={s.item}>
            <div style={s.titleRow}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <span style={s.title}>{f.title}</span>
              <CategoryTag category={f.category as Category} />
            </div>
            <div style={s.metaRow}>
              <span className="mono" style={s.file}>
                {f.file}:{lineLabel(f)}
              </span>
              <ConfidenceNum value={f.confidence} />
            </div>
            <div style={s.rationale}>{f.rationale}</div>
          </div>
        ))
      )}
    </div>,
    document.body,
  );
});
