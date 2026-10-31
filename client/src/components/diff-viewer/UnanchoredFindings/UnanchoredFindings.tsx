/* UnanchoredFindings — findings whose line isn't among the rendered lines of a
   file. Always visible so a finding never silently disappears from the diff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";
import type { DiffFindingApi } from "../findings";

export function UnanchoredFindings({
  findings,
  renderFinding,
}: {
  findings: FindingRecord[];
  renderFinding: DiffFindingApi["renderFinding"];
}) {
  const t = useTranslations("shell");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <div style={cs.outdatedTitle}>{t("diffViewer.unanchoredFindings")}</div>
      {findings.map((f) => (
        <React.Fragment key={f.id}>{renderFinding(f)}</React.Fragment>
      ))}
    </div>
  );
}
