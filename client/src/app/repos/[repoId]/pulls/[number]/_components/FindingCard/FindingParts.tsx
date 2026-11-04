/* Presentational pieces shared by every finding card (Agent runs FindingCard, Smart Diff DiffFinding):
   the severity icon, the title row, and the body (rationale, suggested fix, accept/dismiss). The cards
   keep only their own layout and behaviour (collapse vs. close). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, CategoryTag, Button, Markdown, type Category } from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_WORD_KEY } from "./constants";
import { toSeverity } from "./helpers";
import { s } from "./styles";

/** Severity icon in a tinted square. */
export function FindingSeverityIcon({ f }: { f: FindingRecord }) {
  const sev = SEV[toSeverity(f.severity)];
  const SevIcon = Icon[sev.icon];
  return (
    <span style={s.iconBox(sev.bg, sev.c)}>
      <SevIcon size={15} aria-hidden />
    </span>
  );
}

/** Severity word, title, category and the accepted/dismissed tag. */
export function FindingTitleRow({ f }: { f: FindingRecord }) {
  const t = useTranslations("prReview");
  const sevKey = toSeverity(f.severity);
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  return (
    <span style={s.titleRow}>
      <span style={s.sevWord(SEV[sevKey].c)}>{t(`finding.severityWord.${SEV_WORD_KEY[sevKey]}`)}</span>
      <span style={s.title(accepted || dismissed, dismissed)}>{f.title}</span>
      <CategoryTag category={f.category as Category} />
      {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
      {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
    </span>
  );
}

/** Rationale, bordered suggested fix and the accept/dismiss buttons (a fragment: the card owns the layout). */
export function FindingBody({
  f,
  pending,
  onAction,
}: {
  f: FindingRecord;
  pending?: boolean;
  onAction?: (action: FindingActionKind) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <>
      <div style={s.prose}>
        <Markdown>{f.rationale}</Markdown>
      </div>
      {f.suggestion && (
        <div style={s.fix}>
          <span style={s.fixLabel}>
            <Icon.Lightbulb size={12} aria-hidden />
            {t("finding.suggestedFix")}
          </span>
          <div style={s.prose}>
            <Markdown>{f.suggestion}</Markdown>
          </div>
        </div>
      )}
      <div style={s.actions}>
        <Button
          kind="secondary"
          size="sm"
          icon="Check"
          disabled={pending}
          active={!!f.accepted_at}
          onClick={() => onAction?.("accept")}
        >
          {t("finding.accept")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="X"
          disabled={pending}
          active={!!f.dismissed_at}
          onClick={() => onAction?.("dismiss")}
        >
          {t("finding.dismiss")}
        </Button>
      </div>
    </>
  );
}
