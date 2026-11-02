/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, renderKeyFor, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionByLineKey,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { findingLineKey, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnanchoredFindings } from "../UnanchoredFindings";

const NO_FINDINGS: FindingRecord[] = [];

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line (new-file side only). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return NO_FINDINGS;
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out.length > 0 ? out : NO_FINDINGS;
}

export function FileCard({
  file,
  commenting,
  findings,
  defaultCollapsed,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  defaultCollapsed?: boolean;
}) {
  const t = useTranslations("shell");
  const fileFindings = findings?.byPath.get(file.path) ?? NO_FINDINGS;
  // A finding forces the card open, even in a collapsed group or past the size limit, so it is never hidden.
  const [open, setOpen] = React.useState(
    fileFindings.length > 0 ||
      (!defaultCollapsed && (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES)
  );
  // Findings load separately from the files (e.g. after Run review), so open the card when they arrive too.
  const hasFindings = fileFindings.length > 0;
  React.useEffect(() => {
    if (hasFindings) setOpen(true);
  }, [hasFindings]);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Findings anchored to a rendered line vs. ones whose line isn't in this patch.
  const { matched: matchedFindings, unmatched: unanchored } = React.useMemo(() => {
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionByLineKey(fileFindings, findingLineKey, renderedKeys);
  }, [fileFindings, lines]);

  const showFindings = findings?.showFindings !== false;

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={s.fileHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {fileFindings.length > 0 && (
          <span
            role="img"
            aria-label={t("diffViewer.hasFindings")}
            title={t("diffViewer.hasFindings")}
            style={s.findingsDot}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span style={s.commentCount}>
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </button>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln) => (
              <CodeLine
                key={renderKeyFor(ln)}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                findings={findingsForLine(ln, matchedFindings)}
                renderFinding={showFindings ? findings?.renderFinding : undefined}
                commenting={commenting}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && showFindings && <UnanchoredFindings findings={unanchored} renderFinding={findings.renderFinding} />}
        </div>
      )}
    </div>
  );
}
