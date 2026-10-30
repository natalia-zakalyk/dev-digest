/** Intent layer limits — see server/specs/intent-layer.md. */

/** Bump when the classifier prompt changes: it is part of the input hash, so cached intents recompute. */
export const PROMPT_VERSION = 'intent-v1';

export const INTENT_SCHEMA_NAME = 'IntentClassification';
export const INTENT_TEMPERATURE = 0;
export const INTENT_MAX_TOKENS = 800;
export const INTENT_MAX_RETRIES = 1;

/** A description with fewer non-template characters than this is not "documented". */
export const MIN_DESCRIPTION_CHARS = 80;

/** Linked sources: at most this many docs and issues are fetched per derive. */
export const MAX_LINKED_DOCS = 3;
export const MAX_LINKED_ISSUES = 1;
/** Per-source caps on what reaches the classifier prompt. */
export const MAX_DOC_CHARS = 8_000;
export const MAX_ISSUE_CHARS = 4_000;
export const MAX_DESCRIPTION_CHARS = 4_000;
export const MAX_COMMITS = 30;
export const MAX_FILES = 200;
export const MAX_PRIOR_PRS = 5;
/** Total classifier input budget (tokens); lowest-priority blocks are dropped first. */
export const INPUT_BUDGET_TOKENS = 12_000;

/** Output trimming. */
export const MAX_SCOPE_ITEMS = 8;
export const MAX_RISK_AREAS = 6;
export const MAX_ITEM_CHARS = 140;

/** Links we will not fetch (non-allow-listed hosts, other-repo issues) are recorded, up to this many. */
export const MAX_SKIPPED_LINKS = 5;
