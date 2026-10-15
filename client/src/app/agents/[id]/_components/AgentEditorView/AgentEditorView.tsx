/* AgentEditorView — /agents/:id screen: left agent list + Config editor
   (model + system prompt). Tab state lives in ?tab=. Ported from screen_agents.jsx. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { DEFAULT_AGENT_TAB, isAgentTab, type AgentTab } from "../../constants";
import { AgentEditor } from "../AgentEditor";
import { AgentEditorHeader } from "../AgentEditorHeader";
import { AgentSidebar } from "../AgentSidebar";
import { s } from "./styles";

export function AgentEditorView() {
  const t = useTranslations("agents");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const tabParam = search.get("tab");
  const tab: AgentTab = isAgentTab(tabParam) ? tabParam : DEFAULT_AGENT_TAB;
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    { label: agent?.name ?? t("editor.agentFallback") },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <AgentSidebar
          agents={agents ?? []}
          activeId={id}
          tab={tab}
          onToggle={(agentId, enabled) => update.mutate({ id: agentId, patch: { enabled } })}
        />
        {isLoading || !agent ? (
          <div style={s.skeleton}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <AgentEditorHeader agent={agent} />
            <div style={s.editor}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
