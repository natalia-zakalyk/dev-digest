/* AgentEditor — agent editor tabs: Config (model + system prompt) and Skills
   (L02: link / order the agent's skills). Later lessons add Evals/Stats/CI.
   Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import type { AgentTab } from "../../constants";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({
  agent,
  tab,
  onTab,
}: {
  agent: Agent;
  tab: AgentTab;
  onTab: (tab: string) => void;
}) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* key: switching agents remounts the tab with that agent's values. */}
        {tab === "skills" ? (
          <SkillsTab key={agent.id} agent={agent} />
        ) : (
          <ConfigTab key={agent.id} agent={agent} />
        )}
      </div>
    </div>
  );
}
