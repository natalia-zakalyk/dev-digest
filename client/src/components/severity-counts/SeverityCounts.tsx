/* SeverityCounts — one counter per severity (icon + number). With `onSelect`
   the counters are buttons (hover/focus/tap shows findings); with `hoverOnly`
   they show findings on hover/focus only; without `onSelect` they are plain icons.
   Zero severities are hidden; no findings at all → "—".
   Spec: client/specs/findings-severity.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { SeverityCounts as Counts } from "@devdigest/shared";
import { COUNTED_SEVERITIES, SEVERITY_KEY, type CountedSeverity } from "@/lib/findings";

const row: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10 };

const counter = (color: string, active: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "1px 2px",
  border: "none",
  borderRadius: 4,
  background: active ? "var(--bg-hover)" : "none",
  color,
  font: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationStyle: "dotted",
  textUnderlineOffset: 4,
});

const staticCounter = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color,
  fontSize: 12.5,
  fontWeight: 600,
});

export function SeverityCounts({
  counts,
  active,
  onSelect,
  onLeave,
  hoverOnly,
}: {
  counts: Counts | null | undefined;
  /** The severity whose findings are currently shown, if any. */
  active?: CountedSeverity | null;
  /** Hover, keyboard focus or tap on a counter. */
  onSelect?: (severity: CountedSeverity) => void;
  /** Pointer or focus left a counter. */
  onLeave?: () => void;
  /** Hover/focus shows findings, a click does nothing (Agent runs timeline). */
  hoverOnly?: boolean;
}) {
  const t = useTranslations("common");
  const shown = COUNTED_SEVERITIES.filter((sev) => (counts?.[SEVERITY_KEY[sev]] ?? 0) > 0);
  if (shown.length === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;

  return (
    <span style={row}>
      {shown.map((sev) => {
        const count = counts![SEVERITY_KEY[sev]];
        const I = Icon[SEV[sev].icon];
        const label = t(`findings.counter.${SEVERITY_KEY[sev]}`, { count });
        // Read-only mode (no handlers): plain icons.
        if (!onSelect) {
          return (
            <span key={sev} className="tnum" role="img" aria-label={label} title={label} style={staticCounter(SEV[sev].c)}>
              <I size={13} />
              {count}
            </span>
          );
        }
        // Hover-only mode: not a button — hover or keyboard focus shows the tooltip, clicks do nothing.
        if (hoverOnly) {
          return (
            <span
              key={sev}
              className="tnum"
              role="img"
              tabIndex={0}
              aria-label={label}
              aria-expanded={active === sev}
              onMouseEnter={() => onSelect(sev)}
              onMouseLeave={onLeave}
              onFocus={() => onSelect(sev)}
              onBlur={onLeave}
              style={{ ...counter(SEV[sev].c, active === sev), cursor: "default" }}
            >
              <I size={13} />
              {count}
            </span>
          );
        }
        return (
          <button
            key={sev}
            type="button"
            className="tnum"
            aria-label={label}
            aria-expanded={active === sev}
            onMouseEnter={() => onSelect?.(sev)}
            onMouseLeave={onLeave}
            onFocus={() => onSelect?.(sev)}
            onBlur={onLeave}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(sev); // touch screens have no hover
            }}
            style={counter(SEV[sev].c, active === sev)}
          >
            <I size={13} />
            {count}
          </button>
        );
      })}
    </span>
  );
}
