/* SkillDetail — right-hand panel of the Skills page: header (name, type, version)
   and the Config / Preview / Stats / Versions tabs. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, SKILL_TYPE_COLORS } from "@/components/skill-type-badge";
import { InjectionBadge, InjectionBanner } from "@/components/skill-injection";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { DEFAULT_SKILL_TAB, SKILL_TABS, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillDetail({
  skill,
  onEdit,
  onDeleted,
  onToggle,
}: {
  skill: Skill;
  onEdit: () => void;
  onDeleted: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<SkillTab>(DEFAULT_SKILL_TAB);
  const { color, bg } = SKILL_TYPE_COLORS[skill.type];
  const tabs = SKILL_TABS.map((key) => ({ key, label: t(`detail.tabs.${key}`) }));

  return (
    <section style={s.root} aria-label={skill.name}>
      <InjectionBanner injection={skill.injection} />
      <div style={s.header}>
        <div style={s.iconBox(color, bg)}>
          <Icon.Sparkles size={17} />
        </div>
        <h2 className="mono" style={s.name}>
          {skill.name}
        </h2>
        <SkillTypeBadge type={skill.type} />
        <InjectionBadge injection={skill.injection} />
        <span className="mono" style={s.version}>
          <Icon.GitCommit size={12} />
          {t("preview.version", { version: skill.version })}
        </span>
        <span style={s.spacer} />
        <Button kind="secondary" size="sm" icon="Play" disabled title={t("detail.comingSoon")}>
          {t("detail.runOnEvals")}
        </Button>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as SkillTab)} pad="8px 20px 0" />
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} onEdit={onEdit} onDeleted={onDeleted} onToggle={onToggle} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "evals" && <EvalsTab />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </section>
  );
}
