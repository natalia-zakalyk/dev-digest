/** Tabs of the skill detail panel, in design order. */
export const SKILL_TABS = ["config", "preview", "evals", "stats", "versions"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];
export const DEFAULT_SKILL_TAB: SkillTab = "preview";
