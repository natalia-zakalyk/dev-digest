/* FindingsSeverity — severity counters + a tooltip with that severity's findings.
   Used by the PR list FINDINGS column and, hover-only (no click), by the Agent runs timeline.
   Hover or focus a counter → only that severity's findings (tap on touch screens).
   Leaving the counter closes after a short delay, so the pointer can move into
   the tooltip and scroll it. Esc, an outside click or a page scroll close it too.
   Spec: client/specs/findings-severity.md. */
"use client";

import React from "react";
import type { FindingRecord, SeverityCounts as Counts } from "@devdigest/shared";
import type { CountedSeverity } from "@/lib/findings";
import { SeverityCounts } from "../SeverityCounts";
import { FindingsPopover } from "../FindingsPopover";

/** Grace period for moving the pointer from a counter into the tooltip. */
export const CLOSE_DELAY_MS = 150;

export function FindingsSeverity({
  counts,
  findings,
  loading,
  onOpenChange,
  hoverOnly,
}: {
  counts: Counts | null | undefined;
  /** All findings behind the counts; undefined while they load lazily. */
  findings: FindingRecord[] | undefined;
  loading?: boolean;
  /** Lets a caller fetch findings only once the tooltip is opened. */
  onOpenChange?: (open: boolean) => void;
  /** Open on hover/focus only — clicking a counter does nothing (Agent runs timeline). */
  hoverOnly?: boolean;
}) {
  const [active, setActive] = React.useState<CountedSeverity | null>(null);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pointer is over the tooltip: a counter's blur (e.g. clicking inside the
  // tooltip) must not close it from under the pointer.
  const overTooltip = React.useRef(false);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const open = React.useCallback(
    (sev: CountedSeverity) => {
      cancelClose();
      setActive(sev);
      onOpenChange?.(true);
    },
    [cancelClose, onOpenChange],
  );
  const close = React.useCallback(() => {
    cancelClose();
    overTooltip.current = false;
    setActive(null);
    onOpenChange?.(false);
  }, [cancelClose, onOpenChange]);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!overTooltip.current) close();
    }, CLOSE_DELAY_MS);
  }, [cancelClose, close]);
  const enterTooltip = React.useCallback(() => {
    overTooltip.current = true;
    cancelClose();
  }, [cancelClose]);
  const leaveTooltip = React.useCallback(() => {
    overTooltip.current = false;
    scheduleClose();
  }, [scheduleClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    // The tooltip is position: fixed — close on scroll/resize instead of chasing the anchor.
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [active, close]);

  const shown = active ? findings?.filter((f) => f.severity === active) : undefined;

  return (
    <span ref={anchorRef} style={{ display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <SeverityCounts
        counts={counts}
        active={active}
        onSelect={open}
        onLeave={scheduleClose}
        hoverOnly={hoverOnly}
      />
      {active && anchorRef.current && (
        <FindingsPopover
          ref={popoverRef}
          anchor={anchorRef.current}
          findings={shown}
          loading={loading}
          onMouseEnter={enterTooltip}
          onMouseLeave={leaveTooltip}
        />
      )}
    </span>
  );
}
