import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_ORDER, ROLE_RULES, type PathRule } from '../constants.js';

/** `\` → `/`, strip leading `./` and `/`, lowercase (for matching only). */
export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '')
    .toLowerCase();
}

export function matchesRule(norm: string, rule: PathRule): boolean {
  const parts = norm.split('/');
  const base = parts[parts.length - 1] ?? '';
  const dirs = parts.slice(0, -1);
  switch (rule.kind) {
    case 'basename':
      return rule.names.includes(base);
    case 'suffix':
      return rule.values.some((v) => base.endsWith(v));
    case 'segment':
      return dirs.some((d) => rule.names.includes(d));
    case 'basenamePrefix':
      return rule.values.some((v) => base.startsWith(v));
    case 'basenameInfix':
      return rule.values.some((v) => base.includes(v));
    case 'topDir':
      return dirs.length > 0 && rule.names.includes(dirs[0] ?? '');
  }
}

/** First role in `CLASSIFY_ORDER` with a matching rule wins; otherwise `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const norm = normalizePath(path);
  for (const role of CLASSIFY_ORDER) {
    if (ROLE_RULES[role].some((rule) => matchesRule(norm, rule))) return role;
  }
  return 'core';
}
