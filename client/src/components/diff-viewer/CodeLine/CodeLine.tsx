/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   "+" comment affordance (revealed on row hover or keyboard focus via the
   `dd-line-comment` CSS rule in globals.css), any anchored comment threads, and
   an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import {
  s,
  lineRowFor,
  lineSignFor,
  findingBarFor,
  findingLabelFor,
  findingLabelStack,
  findingRail,
} from "../styles";
import { SEVERITY_LINE_LABEL } from "../constants";
import { sortBySeverity, topSeverity, type DiffFindingApi, type LineSeverity } from "../findings";
import type { FindingRecord } from "@devdigest/shared";
import { SEV, Icon } from "@devdigest/ui";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  findings,
  renderFinding,
  commenting,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  /** Review findings anchored to this line. */
  findings?: FindingRecord[];
  renderFinding?: DiffFindingApi["renderFinding"];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  const [composing, setComposing] = React.useState(false);
  // Finding cards are open by default; the severity label (or the card's X) toggles one closed.
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(new Set());
  const toggleFinding = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = !!target && !composing;
  const lineFindings = findings && renderFinding ? findings : [];
  const top = topSeverity(lineFindings);
  const topColor = top ? SEV[top].c : null;
  // One label per finding (INFO has none), most severe first.
  const hasLabel = (f: FindingRecord) => Object.hasOwn(SEVERITY_LINE_LABEL, f.severity);
  const labelled = sortBySeverity(lineFindings).filter(hasLabel);

  return (
    <div className="dd-code-line" style={cs.rowWrap}>
      <div style={{ ...lineRowFor(ln.kind), ...(topColor ? findingBarFor(topColor) : null) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && (
            <button
              type="button"
              className="dd-line-comment"
              title={t("diffViewer.addComment")}
              aria-label={t("diffViewer.addComment")}
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {labelled.length > 0 && (
          <span style={findingLabelStack}>
            {labelled.map((f) => {
              const sev = f.severity as LineSeverity;
              const LabelIcon = Icon[SEV[sev].icon];
              const isOpen = !closed.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="mono"
                  aria-expanded={isOpen}
                  title={t(isOpen ? "diffViewer.hideFinding" : "diffViewer.showFinding")}
                  onClick={() => toggleFinding(f.id)}
                  style={findingLabelFor(SEV[sev].c, isOpen)}
                >
                  <LabelIcon size={12} aria-hidden />
                  {t(`diffViewer.severityLine.${SEVERITY_LINE_LABEL[sev]}`)}
                </button>
              );
            })}
          </span>
        )}
      </div>

      {renderFinding && lineFindings.some((f) => !closed.has(f.id)) && (
        <div style={findingRail}>
          {sortBySeverity(lineFindings)
            .filter((f) => !closed.has(f.id))
            .map((f) => (
              <React.Fragment key={f.id}>
                {/* Only a labelled finding can be closed: its label is what reopens it. */}
                {renderFinding(f, hasLabel(f) ? { onClose: () => toggleFinding(f.id) } : undefined)}
              </React.Fragment>
            ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
