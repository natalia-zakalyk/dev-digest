/* RunHistory — PR timeline: every agent run interleaved with the PR's commits,
   newest-first and DB-backed so it survives reload. Showing commits between runs
   makes it clear which commit each review ran against. Failed runs show their
   error inline; the logs icon opens the run's trace. Outcome rules: helpers.ts. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { RunFindings } from "./_components/RunFindings";
import { buildTimeline, outcomeOf } from "./helpers";
import { s } from "./styles";

export function RunHistory({
  runs,
  commits = [],
  findingsByRun,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Findings of the review each run produced (run_id → findings), for the severity counters. */
  findingsByRun?: Map<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  if (runs.length === 0 && commits.length === 0) return null;

  const items = buildTimeline(runs, commits);

  return (
    <div style={s.list}>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={s.commitRow}>
              <Icon.GitCommit size={15} style={s.commitIcon} />
              <span className="mono" style={s.commitSha}>
                {c.sha.slice(0, 7)}
              </span>
              <span style={s.commitMsg} title={c.message}>
                {c.message.split("\n")[0]}
              </span>
              <span style={s.commitMeta}>{c.author}</span>
              {c.committed_at && (
                <span style={s.commitMeta}>{new Date(c.committed_at).toLocaleTimeString()}</span>
              )}
            </div>
          );
        }

        const r = item.run;
        const o = outcomeOf(r);
        const settled = r.status === "done";
        return (
          <div key={`run:${r.run_id}`} style={s.row}>
            <Badge color={o.color} bg={o.bg} icon={o.icon}>
              {t(`runStatus.${o.key}`)}
            </Badge>
            {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
            <div style={s.runMain}>
              <div style={s.runTitle}>
                <button
                  type="button"
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  style={s.agentLink(!!onGoToReview)}
                >
                  {r.agent_name ?? t("timeline.agentFallback")}
                </button>{" "}
                <span className="mono" style={s.model}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div style={s.error} title={r.error}>
                  {r.error}
                </div>
              )}
              {settled && (
                <RunFindings
                  findings={findingsByRun?.get(r.run_id)}
                  findingsCount={r.findings_count ?? 0}
                  blockers={r.blockers ?? 0}
                />
              )}
            </div>
            <div style={s.runMeta}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {r.status !== "running" && (
                <RunCostBadge variant="detailed" usd={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />
              )}
            </div>
            <button
              type="button"
              title={t("timeline.openTrace")}
              aria-label={t("timeline.openTrace")}
              onClick={() => onOpenTrace(r.run_id)}
              style={s.traceBtn}
            >
              <Icon.FileText size={13} />
            </button>
            {onDelete && r.status !== "running" && (
              <button
                type="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                style={s.deleteBtn}
              >
                <Icon.Trash size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
