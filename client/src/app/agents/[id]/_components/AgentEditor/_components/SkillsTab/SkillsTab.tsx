/* SkillsTab — which workspace skills this agent uses, and in what order.
   Checkbox = link / unlink (linked = enabled for this agent); linked rows can be
   reordered with native HTML5 drag-and-drop or Alt + ↑/↓ on the handle. The
   order is the order of the skill blocks in the assembled prompt. Every change
   saves immediately (optimistic). A globally disabled skill stays linked but is
   left out of the prompt — shown muted. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { matchesFilter, orderedSkills, toggleLinked } from "./helpers";
import { useSkillDrag } from "./hooks";
import { SkillsPanel } from "./_components/SkillsPanel";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");

  const isLoading = skillsQuery.isLoading || linksQuery.isLoading;
  const isError = skillsQuery.isError || linksQuery.isError;
  const { linked, unlinked } = orderedSkills(skillsQuery.data ?? [], linksQuery.data ?? []);
  const linkedIds = linked.map((sk) => sk.id);
  const total = linked.length + unlinked.length;

  const save = (ids: string[]) => setSkills.mutate(ids);
  const dragFor = useSkillDrag(linkedIds, save);

  const visibleLinked = linked.filter((sk) => matchesFilter(sk, filter));
  const visibleUnlinked = unlinked.filter((sk) => matchesFilter(sk, filter));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        {!isLoading && !isError && (
          <Badge color="var(--accent)" bg="var(--accent-bg)">
            {t("skills.enabledCount", { linked: linked.length, total })}
          </Badge>
        )}
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <SkillsPanel
        isLoading={isLoading}
        isError={isError}
        onRetry={() => {
          void skillsQuery.refetch();
          void linksQuery.refetch();
        }}
        total={total}
        linked={visibleLinked}
        unlinked={visibleUnlinked}
        dragFor={dragFor}
        onToggle={(id) => {
          // A skill blocked by the injection gate can only be unlinked, never newly linked (server answers 422 too).
          const blocked = unlinked.find((sk) => sk.id === id)?.injection?.detected;
          if (blocked) return;
          save(toggleLinked(linkedIds, id));
        }}
      />
    </div>
  );
}
