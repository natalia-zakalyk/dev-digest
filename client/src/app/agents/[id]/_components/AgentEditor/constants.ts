import type { IconName } from "@devdigest/ui";
import type { AgentTab } from "../../constants";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: AgentTab;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Config (Part-0) + Skills (L02); later lessons add the rest. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
];
