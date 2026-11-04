"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import {
  FindingSeverityIcon,
  FindingTitleRow,
  FindingBody,
  findingCardStyles as shared,
  lineLabel,
  toSeverity,
} from "../../../FindingCard";
import { s } from "./styles";

/**
 * The finding card under a diff line (Smart Diff). Shares its pieces with the Agent-runs FindingCard but is
 * always expanded; the X closes it (the severity label on the line reopens it). Wired to accept/dismiss.
 */
export function DiffFinding({
  finding,
  prId,
  onClose,
}: {
  finding: FindingRecord;
  prId: string;
  /** Close the card; omitted for cards with no label to reopen them (the unanchored list). */
  onClose?: () => void;
}) {
  const ts = useTranslations("shell");
  const { mutate, isPending } = useFindingAction();
  const color = SEV[toSeverity(finding.severity)].c;
  const muted = !!finding.accepted_at || !!finding.dismissed_at;

  return (
    <div data-finding-id={finding.id} style={s.card(color, muted)}>
      <div style={s.header}>
        <FindingSeverityIcon f={finding} />
        <div style={s.headText}>
          <FindingTitleRow f={finding} />
          <div style={s.metaRow}>
            <span className="mono" style={s.line}>
              {ts("diffViewer.lineRange", { range: lineLabel(finding) })}
            </span>
            <ConfidenceNum value={finding.confidence} />
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label={ts("diffViewer.hideFinding")}
            title={ts("diffViewer.hideFinding")}
            onClick={onClose}
            style={shared.closeBtn}
          >
            <Icon.X size={14} aria-hidden />
          </button>
        )}
      </div>
      <FindingBody
        f={finding}
        pending={isPending}
        onAction={(action) => mutate({ findingId: finding.id, action, prId })}
      />
    </div>
  );
}
