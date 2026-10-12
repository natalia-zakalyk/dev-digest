import {
  BASE64_BLOB_RE,
  BASE64_BLOB_REASON,
  HIDDEN_CHARS_RE,
  HIDDEN_CHARS_REASON,
  INJECTION_RULES,
} from '../constants.js';

export interface InjectionScan {
  detected: boolean;
  /** Human-readable, de-duplicated reasons (stable order). */
  reasons: string[];
}

/**
 * Gate on USER-SUPPLIED skill content (name + description + body): a skill that tries to hijack the
 * reviewing agent is saved but flagged, blocked from agent links and from prompt assembly.
 * Pure and deterministic — the flag is derived on read, so fixing the text clears it.
 * Not a replacement for reviewer-core's INJECTION_GUARD (specs/skills.md § Injection gate).
 */
export function detectInjection(skill: { name?: string; description?: string; body: string }): InjectionScan {
  const raw = [skill.name ?? '', skill.description ?? '', skill.body].join('\n');
  const reasons: string[] = [];

  if (new RegExp(HIDDEN_CHARS_RE.source).test(raw)) reasons.push(HIDDEN_CHARS_REASON);

  const stripped = raw.normalize('NFKC').replace(HIDDEN_CHARS_RE, '');
  if (BASE64_BLOB_RE.test(stripped)) reasons.push(BASE64_BLOB_REASON);

  // Collapse spaces/tabs but keep newlines: some rules anchor on line starts.
  const text = stripped.toLowerCase().replace(/[ \t\r\f\v]+/g, ' ');
  for (const rule of INJECTION_RULES) {
    if (rule.re.test(text) && !reasons.includes(rule.reason)) reasons.push(rule.reason);
  }
  return { detected: reasons.length > 0, reasons };
}
