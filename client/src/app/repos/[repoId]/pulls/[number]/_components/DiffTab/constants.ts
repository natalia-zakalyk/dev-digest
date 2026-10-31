import type { SmartDiffRole } from "@/lib/types";

/** i18n keys under `prReview.smartDiff`. */
export const ROLE_LABEL_KEY = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
} as const satisfies Record<SmartDiffRole, string>;

export const ROLE_DESCRIPTION_KEY = {
  core: "coreDescription",
  tests: "testsDescription",
  wiring: "wiringDescription",
  docs: "docsDescription",
  boilerplate: "boilerplateDescription",
} as const satisfies Record<SmartDiffRole, string>;

/** Existing theme tokens only. */
export const ROLE_COLOR = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "var(--info)",
  boilerplate: "var(--text-muted)",
} as const satisfies Record<SmartDiffRole, string>;

/** Groups whose file cards start collapsed (the group header stays visible). */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

export const DIFF_ORDERS = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDERS)[number];
