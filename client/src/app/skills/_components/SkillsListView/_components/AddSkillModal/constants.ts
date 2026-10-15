/** Constants for the Add skill modal. */
export const MODAL_WIDTH = 680;

/** Matches the server's import limit (server/src/modules/skills/constants.ts). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** Only these file types can be imported (`accept` is advisory — helpers.isAllowedSkillFile enforces it). */
export const ACCEPT = ".md,.zip";
export const ALLOWED_EXTENSIONS = [".md", ".zip"] as const;

export const ADD_TABS = ["create", "file", "url"] as const;
export type AddTab = (typeof ADD_TABS)[number];
