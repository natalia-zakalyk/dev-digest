/** Constants for the Skills page. */
// Type-only import: the vendored @devdigest/shared barrel can't be bundled by
// Next (its `.js` specifiers don't resolve), so the client never imports values from it.
import type { SkillType } from "@devdigest/shared";

/** Type options for the editor + import forms, in the contract's order. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Which overlay is open on the Skills page. */
export type SkillsOverlay =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; id: string }
  | { kind: "import" };
