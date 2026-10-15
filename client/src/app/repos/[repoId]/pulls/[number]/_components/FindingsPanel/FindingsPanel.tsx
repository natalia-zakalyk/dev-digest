/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { isTextInput } from "@/components/app-shell/helpers";
import { G_NAV_TIMEOUT_MS } from "@/components/app-shell/constants";
import { COUNTED_SEVERITIES, SEVERITY_KEY, countBySeverity, type CountedSeverity } from "@/lib/findings";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const [severity, setSeverity] = React.useState<CountedSeverity | null>(null);

  // Pills count the cards the list would show without a severity filter, so
  // "N CRITICAL" always equals the CRITICAL cards below (no LLM — a plain count).
  const counts = React.useMemo(() => countBySeverity(visibleFindings(findings, hideLow)), [findings, hideLow]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );
  React.useEffect(() => setFocusIdx(0), [severity, hideLow]);
  const present = COUNTED_SEVERITIES.filter((sev) => counts[SEVERITY_KEY[sev]] > 0);

  // Latest values for the window listener, so it subscribes once.
  const latest = React.useRef({ shown, focusIdx, action, prId });
  React.useEffect(() => {
    latest.current = { shown, focusIdx, action, prId };
  });

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    // Mirror the global `g`-then-key navigation chord (useGlobalShortcuts) so
    // e.g. `g a` (go to Agents) doesn't also accept the focused finding.
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTextInput(e.target)) return;
      if (e.key === "g") {
        gPending = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (gPending = false), G_NAV_TIMEOUT_MS);
        return;
      }
      if (gPending) {
        gPending = false;
        clearTimeout(gTimer);
        return;
      }
      const { shown, focusIdx, action, prId } = latest.current;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(gTimer);
    };
  }, []);

  return (
    <div>
      {present.length > 0 && (
        <div style={s.pills} aria-label={t("panel.countsLabel")}>
          {present.map((sev, i) => (
            <React.Fragment key={sev}>
              {i > 0 && <span style={s.pillSep}>·</span>}
              <span className="tnum" style={s.pill(SEV[sev].c, SEV[sev].bg)}>
                {t(`panel.pill.${SEVERITY_KEY[sev]}`, { count: counts[SEVERITY_KEY[sev]] })}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={s.toolbar}>
        <div style={s.filters} role="group" aria-label={t("panel.filterLabel")}>
          {COUNTED_SEVERITIES.map((sev) => (
            <Chip
              key={sev}
              icon={SEV[sev].icon}
              color={SEV[sev].c}
              active={severity === sev}
              onClick={() => setSeverity((cur) => (cur === sev ? null : sev))}
            >
              {t(`panel.filter.${SEVERITY_KEY[sev]}`)}
            </Chip>
          ))}
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
