/* AgentEditorHeader — agent name, provider/model badge, disabled marker and
   the "Run on a PR…" shortcut above the editor tabs. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { s } from "./styles";

export function AgentEditorHeader({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  return (
    <div style={s.header}>
      <Icon.Cpu size={18} style={s.icon} />
      <h1 style={s.title}>{agent.name}</h1>
      <Badge color="var(--text-secondary)" mono>
        {agent.provider}/{agent.model}
      </Badge>
      {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
      <div style={s.actions}>
        <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
          {t("editor.runOnPr")}
        </Button>
      </div>
    </div>
  );
}
