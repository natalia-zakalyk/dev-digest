"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@/lib/types";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { COLLAPSED_ROLES, ROLE_COLOR, ROLE_DESCRIPTION_KEY, ROLE_LABEL_KEY } from "../../constants";
import { filesWithFindings } from "../../helpers";
import { s, chevronFor, swatchFor } from "./styles";

/** One role group of the Smart order view: header (label, description, files-with-findings, file count) + its files. */
export function RoleGroup({
  role,
  files,
  commenting,
  findings,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  commenting: DiffCommentApi;
  findings: DiffFindingApi;
}) {
  const t = useTranslations("prReview.smartDiff");
  const [open, setOpen] = React.useState(true);
  const withFindings = filesWithFindings(files, findings.byPath);

  return (
    <div style={s.group}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={swatchFor(ROLE_COLOR[role])} />
        <span style={s.label}>{t(ROLE_LABEL_KEY[role])}</span>
        <span style={s.description}>{t(ROLE_DESCRIPTION_KEY[role])}</span>
        {withFindings > 0 && (
          <span style={s.findingsCount} aria-label={t("filesWithFindings", { count: withFindings })}>
            ● {withFindings}
          </span>
        )}
        <span style={s.filesCount}>{t("filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <DiffViewer
          files={files}
          commenting={commenting}
          findings={findings}
          defaultCollapsed={COLLAPSED_ROLES.has(role)}
        />
      )}
    </div>
  );
}
