/** First version number written for a new skill (and its `skill_versions` snapshot). */
export const INITIAL_SKILL_VERSION = 1;

/** Import limits — see server/specs/skills.md. */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 200;
export const MAX_SKILL_MD_BYTES = 256 * 1024;

/** base64 grows input by 4/3 — the import route's body limit must fit a max-size file + JSON. */
export const IMPORT_BODY_LIMIT_BYTES = Math.ceil((MAX_IMPORT_FILE_BYTES * 4) / 3) + 64 * 1024;

/** The one file an archive may contribute (matched case-insensitively). */
export const SKILL_MD_FILENAME = 'skill.md';

/** Fallback type for imports whose frontmatter has no (valid) `type`. */
export const DEFAULT_IMPORT_SKILL_TYPE = 'custom';

/** Look-back window of the Stats tab. */
export const STATS_WINDOW_DAYS = 30;
