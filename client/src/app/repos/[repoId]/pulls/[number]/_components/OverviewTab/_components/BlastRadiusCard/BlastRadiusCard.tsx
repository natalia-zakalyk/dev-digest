/* BlastRadiusCard — changed symbols, their callers, endpoints and crons on the Overview tab.
   Spec: client/specs/blast-radius.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, SectionLabel } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import type { BlastRadiusResponse } from "@/lib/types";
import { BlastGraph } from "./_components/BlastGraph";
import { SymbolGroup } from "./_components/SymbolGroup";
import { ViewToggle } from "./_components/ViewToggle";
import { DEFAULT_BLAST_VIEW, type BlastView } from "./constants";
import { canResync, resolveReason, symbolsWithoutCallers } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}

function Stats({ counts }: { counts: BlastRadiusResponse["counts"] }) {
  const t = useTranslations("blast");
  const items = [
    ["symbols", counts.symbols],
    ["callers", counts.callers],
    ["endpoints", counts.endpoints],
    ["crons", counts.crons],
  ] as const;
  return (
    <div style={s.stats}>
      {items.map(([key, n]) => (
        <div key={key} style={s.stat}>
          <span style={s.statValue}>{n}</span>
          <span style={s.statLabel}>{t(`stat.${key}`)}</span>
        </div>
      ))}
    </div>
  );
}

function DegradedNote({ reason, repoId }: { reason: string | null | undefined; repoId: string }) {
  const t = useTranslations("blast");
  const resync = useResyncRepoIntel(repoId);
  const resolved = resolveReason(reason);
  return (
    <div role="note" style={s.notice}>
      <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
        {t("degraded.title")}
      </Badge>
      <span>{t(`degraded.reason.${resolved}`)}</span>
      {canResync(resolved) && (
        <Button size="sm" icon="RefreshCw" loading={resync.isPending} onClick={() => resync.mutate()}>
          {t("resync")}
        </Button>
      )}
    </div>
  );
}

/** The graph, the empty note, or the tree of symbols with their callers (early returns, no nested ternary). */
function DownstreamView({
  view,
  data,
  repoFullName,
  headSha,
}: {
  view: BlastView;
  data: BlastRadiusResponse;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  if (view === "graph") return <BlastGraph downstream={data.downstream} counts={data.counts} />;
  if (data.downstream.length === 0) {
    return <div style={s.muted}>{t("noDownstream", { count: data.counts.symbols })}</div>;
  }
  return (
    <ul style={s.list}>
      {data.downstream.map((impact) => (
        <SymbolGroup key={impact.symbol} impact={impact} repoFullName={repoFullName} headSha={headSha} />
      ))}
    </ul>
  );
}

function BlastBody({ data, repoId, repoFullName, headSha }: { data: BlastRadiusResponse } & Omit<BlastRadiusCardProps, "prId">) {
  const t = useTranslations("blast");
  const reason = resolveReason(data.reason);
  // Only a partial index still carries data worth showing; every other degraded state is empty.
  const showData = !data.degraded || reason === "index_partial";
  const withoutCallers = symbolsWithoutCallers(data);
  const [view, setView] = React.useState<BlastView>(DEFAULT_BLAST_VIEW);

  return (
    <>
      {data.degraded && <DegradedNote reason={data.reason} repoId={repoId} />}
      {showData && (
        <>
          <div style={s.statsRow}>
            <Stats counts={data.counts} />
            <ViewToggle value={view} onChange={setView} />
          </div>
          <DownstreamView view={view} data={data} repoFullName={repoFullName} headSha={headSha} />
          {data.downstream.length > 0 && withoutCallers.length > 0 && (
            <div style={{ ...s.muted, marginTop: 10 }}>{t("noCallersRest", { count: withoutCallers.length })}</div>
          )}
        </>
      )}
    </>
  );
}

function BlastContent(props: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError } = usePrBlast(props.prId);

  if (isLoading) {
    return (
      <div style={s.muted} aria-busy="true">
        {t("loading")}
      </div>
    );
  }
  if (isError || !data) return <div style={s.muted}>{t("loadError")}</div>;
  return <BlastBody data={data} repoId={props.repoId} repoFullName={props.repoFullName} headSha={props.headSha} />;
}

export function BlastRadiusCard(props: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  return (
    <section aria-label={t("title")} style={s.root}>
      <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
      <Card style={s.card}>
        <BlastContent {...props} />
      </Card>
    </section>
  );
}
