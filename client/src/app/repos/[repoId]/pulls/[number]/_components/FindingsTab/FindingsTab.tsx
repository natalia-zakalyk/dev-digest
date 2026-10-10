/* FindingsTab — the "Agent runs" tab: live review (SSE log + cancel), banners,
   the runs/commits timeline and one ReviewRunAccordion per review. Owns the
   run-level mutations (cancel live runs, delete a run after confirmation). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCancelRun, useDeleteRun } from "@/lib/hooks/reviews";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";

export interface FindingsTabProps {
  prId: string | null;
  /** In-flight run ids (server-sourced). Non-empty = a review is running. */
  liveRunIds: string[];
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (runId: string) => void;
  /** Live streams closed (runs done or failed). */
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  repoFullName,
  headSha,
  onOpenTrace,
  onRunDone,
}: FindingsTabProps) {
  const t = useTranslations("prReview");
  const cancel = useCancelRun();
  const deleteRun = useDeleteRun(prId);
  const [deletingRunId, setDeletingRunId] = React.useState<string | null>(null);
  const reviewRunning = liveRunIds.length > 0;

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const goToReview = (runId: string) => setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));

  // Timeline severity counters: each run's findings via the review it produced.
  const findingsByRun = React.useMemo(() => {
    const m = new Map<string, FindingRecord[]>();
    for (const review of runs) if (review.run_id) m.set(review.run_id, review.findings);
    return m;
  }, [runs]);

  const confirmDelete = () => {
    if (deletingRunId) deleteRun.mutate(deletingRunId);
    setDeletingRunId(null);
  };

  return (
    <section>
      {reviewRunning && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancel.isPending}
                  onClick={() => liveRunIds.forEach((id) => cancel.mutate(id))}
                >
                  {t("findingsTab.cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={() => onOpenTrace(liveRunIds[0]!)}>
                  {t("findingsTab.openRunTrace")}
                </Button>
              </div>
            }
          >
            {t("findingsTab.liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={s.spinner} />
          <span style={s.reviewInProgressText}>{t("findingsTab.reviewInProgress")}</span>
          <span style={s.reviewInProgressSub}>{t("findingsTab.reviewInProgressSub")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={s.shieldIcon} />
          <span style={s.lethalTrifectaTitle}>{t("findingsTab.lethalTrifecta")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("findingsTab.lethalTrifectaCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel icon="Activity" right={<span style={s.sectionHint}>{t("findingsTab.timelineHint")}</span>}>
            {t("findingsTab.timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            onOpenTrace={onOpenTrace}
            findingsByRun={findingsByRun}
            onGoToReview={goToReview}
            onDelete={setDeletingRunId}
          />
        </div>
      )}

      <SectionLabel icon="AlertOctagon" right={<span style={s.sectionHint}>{t("findingsTab.reviewRunsHint")}</span>}>
        {t("findingsTab.reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning ? null : (
          <EmptyState icon="Sparkles" title={t("findingsTab.emptyTitle")} body={t("findingsTab.emptyBody")} />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}

      <ConfirmDialog
        open={deletingRunId != null}
        danger
        title={t("timeline.deleteRunTitle")}
        body={t("timeline.deleteRunBody")}
        confirmLabel={t("timeline.deleteRunConfirm")}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingRunId(null)}
      />
    </section>
  );
}
