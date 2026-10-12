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

/**
 * Injection gate (specs/skills.md § Injection gate). Each rule is matched against the NORMALISED text
 * (NFKC, zero-width/bidi stripped, whitespace collapsed, lower-cased). Rules are deliberately anchored
 * to override / hijack semantics so legit review rubrics ("never approve while a CRITICAL exists",
 * "return an empty findings list when clean") stay clean — see test/skill-injection.test.ts.
 */
export interface InjectionRule {
  reason: string;
  re: RegExp;
}

export const INJECTION_RULES: readonly InjectionRule[] = [
  {
    reason: 'Instruction override ("ignore previous instructions")',
    re: /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|preceding|system|safety)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|guidelines?|directions?|constraints?)\b/,
  },
  { reason: 'Instruction override ("new instructions:")', re: /\bnew instructions?\s*:/ },
  {
    reason: 'Role / identity hijack ("you are now …")',
    re: /\byou are now\b|\bfrom now on,? you\b|\bpretend (?:to be|you are)\b|\bact as (?:if you (?:are|were)|an? (?:unrestricted|different|jailbroken))\b|\b(?:jailbreak|do anything now|developer mode)\b/,
  },
  {
    reason: 'Fake system markup (system: / chat-template tokens)',
    re: /(?:^|\n)\s*(?:system|assistant)\s*:|<\|(?:im_start|im_end|system)\|>|\[\/?inst\]|<\/?untrusted\b|<\/?system>/,
  },
  {
    reason: 'Prompt exfiltration ("output your system prompt")',
    re: /\b(?:output|reveal|print|show|repeat|leak|dump|disclose)\b[^.\n]{0,40}\b(?:system prompts?|your (?:system )?(?:prompt|instructions)|agent configurations?|hidden (?:prompt|instructions))\b/,
  },
  {
    reason: 'Verdict / score manipulation ("always return score 100")',
    re: /\balways (?:return|give|output|set|assign)\b[^.\n]{0,25}\bscore\b[^.\n]{0,15}\b100\b|\bscore of 100\b[^.\n]{0,40}\bapprove\b/,
  },
  {
    reason: 'Verdict manipulation ("approve all PRs")',
    re: /\b(?:approve|accept)\b[^.\n]{0,15}\b(?:all|every|any)\b[^.\n]{0,20}\b(?:prs?|pull requests?|changes|code)\b|\balways (?:return|output|give) (?:an? )?(?:empty|no) findings\b/,
  },
  {
    reason: 'Suppressing security findings ("never mention security issues")',
    re: /\bnever\b[^.\n]{0,20}\b(?:flag|report|mention|raise|reveal)\b[^.\n]{0,30}\b(?:security|vulnerabilit)/,
  },
  {
    reason: 'Hidden directive in an HTML comment',
    re: /<!--[\s\S]{0,400}?\b(?:ignore|instructions?|system|always|never)\b[\s\S]*?-->/,
  },
];

/** Zero-width and bidi-control characters: invisible text that can smuggle instructions. */
export const HIDDEN_CHARS_RE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
export const HIDDEN_CHARS_REASON = 'Hidden zero-width / bidi characters';

/** A long unbroken base64-looking blob (checked on the text before whitespace collapsing). */
export const BASE64_BLOB_RE = /[A-Za-z0-9+/]{200,}={0,2}/;
export const BASE64_BLOB_REASON = 'Long base64 blob (possible hidden payload)';
