/* PR Detail — /repos/:repoId/pulls/:number. Thin orchestrator: resolves the
   route number → PR uuid, switches between not-found / loading / error, and
   composes <PrDetailView/> (header, ?tab tabs, ?trace drawer). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePullDetail, usePulls } from "@/lib/hooks/core";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { PrDetailSkeleton } from "./_components/PrDetailSkeleton";
import { PrDetailView } from "./_components/PrDetailView";
import { buildPrCrumb, resolvePrId } from "./helpers";

export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const t = useTranslations("prReview");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = resolvePrId(pulls, number);
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = buildPrCrumb({
    repoId,
    number,
    repoName: repoFullName ?? repoId,
    pullsLabel: t("detail.breadcrumbPulls"),
  });

  let content: React.ReactNode;
  if (repoNotFound) {
    // Stale/unknown :repoId → friendly empty state instead of a 404 error.
    content = <RepoNotFound />;
  } else if (pullsLoading || (prId != null && detailLoading)) {
    content = <PrDetailSkeleton />;
  } else if (isError || !pr || !prId) {
    content = (
      <ErrorState
        fullScreen
        title={t("detail.loadErrorTitle")}
        body={error instanceof ApiError ? error.message : t("detail.loadErrorBody", { number })}
        onRetry={() => refetch()}
      />
    );
  } else {
    content = <PrDetailView repoId={repoId} number={number} prId={prId} pr={pr} repoFullName={repoFullName} />;
  }

  return <AppShell crumb={crumb}>{content}</AppShell>;
}
