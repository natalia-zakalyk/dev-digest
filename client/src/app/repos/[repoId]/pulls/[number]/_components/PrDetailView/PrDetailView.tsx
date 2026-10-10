/* PrDetailView — a loaded PR: header + tabs (?tab) + the run-trace drawer
   (?trace). Wires the review/run data hooks; live-run tracking is
   SERVER-SOURCED (agent_runs status='running'), so it survives navigation and
   reload and self-clears via polling when runs finish. */
"use client";

import React from "react";
import type { PrDetail } from "@/lib/types";
import { githubPrUrl } from "@/lib/github-urls";
import { useInvalidatePrRuns, usePrActiveRuns, usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import { RunTraceDrawer } from "../RunTraceDrawer";
import { collectFindings, findRun, lethalTrifectaFindings } from "../../helpers";
import { usePrDetailParams } from "../../use-pr-detail-params";
import { s } from "./styles";

export interface PrDetailViewProps {
  repoId: string;
  /** Route segment (PR number) — the URL key. */
  number: string;
  /** PR uuid — the API key. */
  prId: string;
  pr: PrDetail;
  /** owner/repo, null until the repo is loaded (disables GitHub deep-links). */
  repoFullName: string | null;
}

export function PrDetailView({ repoId, number, prId, pr, repoFullName }: PrDetailViewProps) {
  const { tab, traceRunId, setTab, openTrace, closeTrace } = usePrDetailParams(repoId, number);
  const { data: reviews } = usePrReviews(prId);
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const invalidate = useInvalidatePrRuns(prId);

  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings = collectFindings(reviews);
  const traceRun = findRun(reviews, traceRunId);

  return (
    <>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={allFindings.length}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={invalidate.activeRuns}
      />

      <div style={s.body}>
        {tab === "overview" && <OverviewTab prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={liveRunIds}
            lethalTrifecta={lethalTrifectaFindings(allFindings)}
            runs={runs}
            prRuns={prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            onOpenTrace={openTrace}
            // Streams closed (done OR failed): refresh active runs, run history
            // and reviews so a just-failed run shows up without a reload.
            onRunDone={invalidate.runSettled}
          />
        )}

        {tab === "diff" && (
          <DiffTab prId={prId} filesCount={pr.files_count} files={pr.files} canComment={pr.status === "open"} />
        )}
      </div>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={traceRun?.findings ?? []}
          agentName={traceRun?.agent_name ?? null}
          running={liveRunIds.includes(traceRunId)}
          onClose={closeTrace}
        />
      )}
    </>
  );
}
