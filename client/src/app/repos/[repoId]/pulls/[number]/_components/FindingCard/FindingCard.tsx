/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { Icon, MonoLink, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { FindingSeverityIcon, FindingTitleRow, FindingBody } from "./FindingParts";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const bodyId = React.useId();
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const muted = !!f.accepted_at || !!f.dismissed_at;

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div style={s.header}>
        {/* Disclosure toggle is a real button; the file link stays outside it
            (no interactive content nested inside a button). */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((e) => !e)}
          style={s.toggle}
        >
          <FindingSeverityIcon f={f} />
          <FindingTitleRow f={f} />
          <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
        </button>
        <div style={s.metaRow}>
          <MonoLink href={fileHref}>
            {f.file}:{lineLabel(f)}
          </MonoLink>
          <ConfidenceNum value={f.confidence} />
        </div>
      </div>

      {expanded && (
        <div id={bodyId} style={s.body}>
          <FindingBody f={f} pending={pending} onAction={onAction} />
        </div>
      )}
    </div>
  );
}
