/* IntentCard — the PR's derived intent (what it is for, in/out of scope, risk areas) on the
   Overview tab. Spec: client/specs/intent-layer.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks/intent";
import { INTENT_CONFIDENCE_COLORS } from "./constants";
import { shortDate, visibleSources } from "./helpers";
import { s } from "./styles";

function ScopeList({ label, items, emptyText }: { label: string; items: string[]; emptyText?: string }) {
  if (items.length === 0 && !emptyText) return null;
  return (
    <div>
      <div style={s.listLabel}>{label}</div>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div style={s.muted}>{emptyText}</div>
      )}
    </div>
  );
}

function IntentBody({ intent, prId }: { intent: PrIntentRecord; prId: string }) {
  const t = useTranslations("intent");
  const derive = useDeriveIntent(prId);
  const confidence = INTENT_CONFIDENCE_COLORS[intent.confidence];
  const sources = visibleSources(intent.sources);

  return (
    <>
      <blockquote style={s.quote}>{intent.intent}</blockquote>

      <div style={s.lists}>
        <ScopeList label={t("inScope")} items={intent.in_scope} />
        <ScopeList label={t("outOfScope")} items={intent.out_of_scope} emptyText={t("noneExplicit")} />
      </div>

      {intent.risk_areas.length > 0 && (
        <div>
          <div style={{ ...s.listLabel, marginTop: 16, marginBottom: 0 }}>{t("riskAreas")}</div>
          <div style={{ ...s.chips, marginTop: 8 }}>
            {intent.risk_areas.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
        </div>
      )}

      {intent.confidence === "low" && (
        <div role="note" style={s.notice}>
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            {t("lowConfidenceHint")}
          </Badge>
        </div>
      )}
      {intent.stale && (
        <div role="note" style={s.notice}>
          <span>{t("stale")}</span>
          <Button
            size="sm"
            icon="RefreshCw"
            loading={derive.isPending}
            onClick={() => derive.mutate({ force: true })}
          >
            {t("refresh")}
          </Button>
        </div>
      )}
      {intent.method === "heuristic" && (
        <div role="note" style={{ ...s.muted, marginTop: 10 }}>
          {t("fallback")}
        </div>
      )}

      <div style={s.footer}>
        <Badge color={confidence.color} bg={confidence.bg}>
          {t("confidence.label", { level: t(`confidence.${intent.confidence}`) })}
        </Badge>
        {sources.length > 0 && (
          <span>
            {t("sourcesLabel")}{" "}
            {sources.map((src) => t(`sources.${src.key}`, { ref: src.ref })).join(" · ")}
          </span>
        )}
        {intent.model && <span>{t("generatedBy", { model: intent.model, date: shortDate(intent.generated_at) })}</span>}
      </div>
    </>
  );
}

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("intent");
  const { data, isLoading, isError } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);
  const intent = data?.intent ?? null;

  return (
    <section aria-label={t("title")}>
      <SectionLabel icon="MessageSquare">{t("title")}</SectionLabel>
      <Card style={{ width: "100%" }}>
        {isLoading ? (
          <div style={s.muted} aria-busy="true">
            {t("loading")}
          </div>
        ) : isError ? (
          <div style={s.muted}>{t("loadError")}</div>
        ) : intent ? (
          <IntentBody intent={intent} prId={prId} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={s.muted}>{t("empty")}</span>
            <Button size="sm" loading={derive.isPending} onClick={() => derive.mutate({})}>
              {derive.isPending ? t("deriving") : t("derive")}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
