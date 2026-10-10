/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. The disclosure toggle and
   the delete button are siblings, so Enter on delete never toggles. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteReview } from "@/lib/hooks/reviews";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { VERDICT_COLOR, VERDICT_COLOR_FALLBACK } from "./constants";
import { countBlockers, formatWhen } from "./helpers";
import { s } from "./styles";

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
}: {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const [confirming, setConfirming] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bodyId = React.useId();
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      rootRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, [targetRunId, targetNonce, review.run_id]);
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = countBlockers(findings);
  const verdictColor = (review.verdict && VERDICT_COLOR[review.verdict]) || VERDICT_COLOR_FALLBACK;
  const agentName = review.agent_name ?? t("reviewRun.agentFallback");

  const confirmDelete = () => {
    setConfirming(false);
    del.mutate(review.id);
  };

  return (
    <div ref={rootRef} id={review.run_id ? `review-run-${review.run_id}` : undefined} style={s.root}>
      <div style={s.headerRow}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          style={s.toggle}
        >
          <Icon.Cpu size={15} style={s.icon} />
          <span style={s.agent}>{agentName}</span>
          {review.verdict && (
            <Badge color={verdictColor} bg="transparent">
              {review.verdict.replace("_", " ")}
            </Badge>
          )}
          <span style={s.counts}>
            {t("reviewRun.findings", { count: findings.length })}
            {blockers > 0 ? t("reviewRun.blockers", { count: blockers }) : ""}
          </span>
          <span style={s.spacer} />
          {review.score != null && (
            <Badge mono color="var(--text-secondary)">
              {review.score}
            </Badge>
          )}
          <span className="mono" style={s.when}>
            {formatWhen(review.created_at)}
          </span>
          <Icon.ChevronDown size={16} style={s.chevron(open)} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={del.isPending}
          title={t("reviewRun.deleteLabel")}
          aria-label={t("reviewRun.deleteLabel")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spin : undefined} />
        </button>
      </div>

      {open && (
        <div id={bodyId} style={s.body}>
          {review.verdict && (
            <div style={s.verdict}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
              />
            </div>
          )}
          <FindingsPanel findings={findings} prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        danger
        title={t("reviewRun.deleteTitle", { agent: agentName })}
        body={t("reviewRun.deleteBody")}
        confirmLabel={t("reviewRun.deleteConfirm")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
