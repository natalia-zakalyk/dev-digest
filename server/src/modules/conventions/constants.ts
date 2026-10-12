/** Conventions extractor limits — see server/specs/conventions.md. */
export const MAX_SAMPLE_FILES = 12;
/** Per-file cap sent to the model (lines are numbered so it can cite them). */
export const MAX_PROMPT_FILE_LINES = 200;
export const MAX_PROMPT_FILE_BYTES = 8 * 1024;
/** Candidates below this confidence are dropped. */
export const MIN_CONFIDENCE = 0.5;
/** Evidence ranges longer than this are clamped (snippet stays reviewable). */
export const MAX_EVIDENCE_LINES = 40;
export const MAX_CANDIDATES = 40;

/** Config files that encode conventions; read from the clone root when present. */
export const CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  '.editorconfig',
  'biome.json',
] as const;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const EXTRACTION_MAX_TOKENS = 4000;
export const EXTRACTION_TEMPERATURE = 0.1;

export const SKILL_DRAFT_SOURCE = 'extracted' as const;
