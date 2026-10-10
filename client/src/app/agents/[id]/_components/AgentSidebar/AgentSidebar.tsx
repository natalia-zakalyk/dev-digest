/* AgentSidebar — left list of agents in the editor; each card links to that
   agent on the current tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { AgentCard } from "../../../_components/AgentCard";
import { agentEditorHref } from "../../../helpers";
import type { AgentTab } from "../../constants";
import { s } from "./styles";

export function AgentSidebar({
  agents,
  activeId,
  tab,
  onToggle,
}: {
  agents: Agent[];
  activeId: string;
  tab: AgentTab;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const router = useRouter();
  return (
    <aside style={s.aside} aria-label={t("editor.listTitle")}>
      <div style={s.head}>
        <div style={s.titleRow}>
          <h2 style={s.title}>{t("editor.listTitle")}</h2>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                {t("editor.add")}
              </Button>
            }
            items={[
              { label: t("editor.createFromScratch"), icon: "Edit", onClick: () => router.push("/agents") },
            ]}
          />
        </div>
      </div>
      <div style={s.list}>
        {agents.map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            href={agentEditorHref(a.id, tab)}
            onToggle={(enabled) => onToggle(a.id, enabled)}
          />
        ))}
      </div>
    </aside>
  );
}
