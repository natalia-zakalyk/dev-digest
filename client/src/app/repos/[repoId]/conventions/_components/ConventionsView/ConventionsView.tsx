/* ConventionsView — /repos/:repoId/conventions. Run the extractor, review candidates
   (accept / reject / edit), then merge the accepted ones into a skill.
   Spec: client/specs/conventions.md */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { SKELETON_CARDS, STATUS_FILTERS, type StatusFilter } from "./constants";
import { countByStatus, filterByStatus } from "./helpers";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard";
import { SkillDraftModal } from "./_components/SkillDraftModal";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = React.useState(false);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const all = data?.candidates ?? [];
  const acceptedIds = all.filter((c) => c.status === "accepted").map((c) => c.id);
  const visible = filterByStatus(all, filter);

  const runExtraction = () =>
    extract.mutate(undefined, {
      onSuccess: (r) => toast.success(t("page.extracted", { verified: r.stats.verified, dropped: r.stats.dropped })),
      onError: () => toast.error(t("page.extractionFailed")),
    });

  // Select / deselect all accepts every pending-or-rejected card, or resets accepted ones.
  const allAccepted = all.length > 0 && acceptedIds.length === all.length;
  const toggleAll = () =>
    all.forEach((c) => {
      const next = allAccepted ? "pending" : "accepted";
      if (c.status !== next) update.mutate({ id: c.id, patch: { status: next } });
    });

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            <p style={s.sub}>
              {data?.last_scan_at ? t("page.candidateCount", { count: all.length }) : t("page.subtitle")}
            </p>
          </div>
          <div style={s.spacer}>
            <Button icon="RefreshCw" onClick={runExtraction} loading={extract.isPending} disabled={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          </div>
        </div>

        {isLoading || extract.isPending ? (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={170} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />
        ) : all.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={extract.isSuccess ? t("page.empty.noneVerifiedTitle") : t("page.empty.title")}
            body={extract.isSuccess ? t("page.empty.noneVerifiedBody", { dropped: extract.data.stats.dropped }) : t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runExtraction}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <Button size="sm" icon={allAccepted ? "X" : "Check"} onClick={toggleAll}>
                {allAccepted ? t("page.deselectAll") : t("page.selectAll")}
              </Button>
              <span style={s.count}>{t("page.acceptedCount", { accepted: acceptedIds.length, total: all.length })}</span>
              {STATUS_FILTERS.map((f) => (
                <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={countByStatus(all, f)}>
                  {t(`filters.${f}`)}
                </Chip>
              ))}
              <div style={s.spacer}>
                <Button kind="primary" icon="Sparkles" disabled={acceptedIds.length === 0} onClick={() => setModalOpen(true)}>
                  {t("page.createSkill")}
                </Button>
              </div>
            </div>
            <div style={s.list}>
              {visible.map((c) => (
                <ConventionCard
                  key={c.id}
                  convention={c}
                  onSetStatus={(status) => update.mutate({ id: c.id, patch: { status } })}
                  onEditRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <SkillDraftModal
          repoId={repoId}
          repoName={activeRepo?.name ?? repoName}
          conventionIds={acceptedIds}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
