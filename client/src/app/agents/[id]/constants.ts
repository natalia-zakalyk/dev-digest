/** Agent editor tabs (?tab=). Config (Part-0) + Skills (L02); later lessons add the rest. */
export const AGENT_TABS = ["config", "skills"] as const;
export type AgentTab = (typeof AGENT_TABS)[number];

export const DEFAULT_AGENT_TAB: AgentTab = "config";

/** Type guard for the `?tab=` search param. */
export function isAgentTab(value: string | null | undefined): value is AgentTab {
  return AGENT_TABS.some((tab) => tab === value);
}
