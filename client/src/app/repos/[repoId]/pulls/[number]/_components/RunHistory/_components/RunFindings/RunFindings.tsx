/* RunFindings — severity icons of a finished run (+ blockers); hovering one
   shows that level's findings, clicking does nothing. Falls back to the plain
   "N findings" text when the run's review isn't loaded. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsSeverity } from "@/components/severity-counts";
import { countBySeverity } from "@/lib/findings";
import { s } from "../../styles";

export function RunFindings({
  findings,
  findingsCount,
  blockers,
}: {
  findings: FindingRecord[] | undefined;
  findingsCount: number;
  blockers: number;
}) {
  const t = useTranslations("prReview");
  const counts = React.useMemo(() => (findings ? countBySeverity(findings) : null), [findings]);
  return (
    <div style={s.findings}>
      {counts ? (
        <FindingsSeverity counts={counts} findings={findings} hoverOnly />
      ) : (
        t("runStatus.findings", { count: findingsCount })
      )}
      {blockers > 0 ? t("runStatus.blockers", { count: blockers }) : ""}
    </div>
  );
}
