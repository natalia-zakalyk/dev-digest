/** Agent editor tabs (?tab=). Part-0 ships Config only; later lessons add the rest. */
export const AGENT_TABS = ["config"] as const;
export type AgentTab = (typeof AGENT_TABS)[number];

export const DEFAULT_AGENT_TAB: AgentTab = "config";

/** Type guard for the `?tab=` search param. */
export function isAgentTab(value: string | null | undefined): value is AgentTab {
  return AGENT_TABS.some((tab) => tab === value);
}
