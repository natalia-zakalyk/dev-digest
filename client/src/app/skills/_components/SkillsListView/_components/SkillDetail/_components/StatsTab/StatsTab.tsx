/* StatsTab — usage KPIs for a skill: who uses it, how often it is pulled, how its findings fare. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, Donut, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLORS, FALLBACK_CATEGORY_COLOR } from "./constants";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={s.root}>
        <Skeleton height={84} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  const percent = (v: number | null) =>
    v === null ? (
      t("stats.noData")
    ) : (
      <>
        {Math.round(v)}
        <span style={s.tileUnit}>%</span>
      </>
    );
  const segments = data.findings_by_category.map((c) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLORS[c.category] ?? FALLBACK_CATEGORY_COLOR,
  }));

  return (
    <div style={s.root}>
      <div style={s.kpis}>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.usedBy")}</div>
          <div style={s.tileValue}>
            {data.agents.length}
            <span style={s.tileUnit}>{t("stats.agentsCount", { count: data.agents.length }).replace(/^\d+\s*/, "")}</span>
          </div>
        </div>
        <div style={s.tile} title={t("stats.pullHint")}>
          <div style={s.tileLabel}>{t("stats.pullFrequency")}</div>
          <div style={s.tileValue}>{percent(data.pull_frequency)}</div>
        </div>
        <div style={s.tile} title={t("stats.acceptHint")}>
          <div style={s.tileLabel}>{t("stats.acceptRate")}</div>
          <div style={s.tileValue}>{percent(data.accept_rate)}</div>
          {data.accept_rate !== null && (
            <div style={s.tileScore}>
              <CircularScore score={Math.round(data.accept_rate)} size={40} />
            </div>
          )}
        </div>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.findings")}</div>
          <div style={s.tileValue}>{data.findings_30d}</div>
        </div>
      </div>

      <div style={s.cards}>
        <section style={s.card}>
          <h3 style={s.cardTitle}>
            <Icon.Cpu size={14} />
            {t("stats.agentsTitle")}
          </h3>
          {data.agents.length === 0 ? (
            <p style={s.empty}>{t("stats.noAgents")}</p>
          ) : (
            data.agents.map((a) => (
              <div key={a.id} style={s.row}>
                <span style={s.agentIcon}>
                  <Icon.Cpu size={13} />
                </span>
                <span style={s.agentName}>{a.name}</span>
                <Link href={`/agents/${a.id}`} style={s.link}>
                  {t("stats.open")}
                </Link>
              </div>
            ))
          )}
        </section>
        <section style={s.card}>
          <h3 style={s.cardTitle}>
            <Icon.Tag size={14} />
            {t("stats.categoriesTitle")}
          </h3>
          {segments.length === 0 ? (
            <p style={s.empty}>{t("stats.noFindings")}</p>
          ) : (
            <Donut segments={segments} valuePrefix="" formatValue={(v) => String(v)} />
          )}
        </section>
      </div>
    </div>
  );
}
