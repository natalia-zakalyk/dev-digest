import type { IntentClassification } from '@devdigest/shared';
import type { PrInputs } from '../types.js';
import { MAX_ITEM_CHARS, MAX_RISK_AREAS, MAX_SCOPE_ITEMS } from '../constants.js';

const BRANCH_PREFIX: Record<string, string> = {
  fix: 'Bug fix',
  bugfix: 'Bug fix',
  hotfix: 'Bug fix',
  feat: 'Feature',
  feature: 'Feature',
  chore: 'Chore',
  refactor: 'Refactor',
  docs: 'Docs',
  test: 'Tests',
  perf: 'Performance',
};

/** Path rule → short risk-area label (first match per rule). */
const RISK_RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /(^|\/)migrations?\//i, label: 'database migration' },
  { pattern: /(^|\/)(schema|db)\//i, label: 'database schema' },
  { pattern: /auth|session|token|password|secret|permission/i, label: 'auth & secrets' },
  { pattern: /(^|\/)adapters?\//i, label: 'external adapters' },
  { pattern: /(^|\/)(api|routes?)\//i, label: 'public API' },
  { pattern: /(^|\/)(\.github|ci|docker|infra)\b|Dockerfile|docker-compose/i, label: 'build & deploy' },
  { pattern: /package\.json$|lock\.ya?ml$|package-lock\.json$/i, label: 'dependencies' },
];

const clip = (s: string) => s.slice(0, MAX_ITEM_CHARS);

/** Model-free fallback intent: title + branch type, touched top-level dirs, path-rule risks. Always low confidence. */
export function heuristicIntent(inputs: PrInputs): IntentClassification {
  const { pull, files } = inputs;
  const prefix = BRANCH_PREFIX[(pull.branch.split('/')[0] ?? '').toLowerCase()];
  const intent = clip(prefix && pull.branch.includes('/') ? `${prefix}: ${pull.title}` : pull.title);

  const dirs = new Set<string>();
  for (const f of files) {
    const top = f.path.includes('/') ? `${f.path.split('/')[0]}/` : '(repo root)';
    dirs.add(top);
  }
  const risks: string[] = [];
  for (const rule of RISK_RULES) {
    if (files.some((f) => rule.pattern.test(f.path)) && !risks.includes(rule.label)) risks.push(rule.label);
  }
  return {
    intent,
    in_scope: [...dirs].slice(0, MAX_SCOPE_ITEMS).map(clip),
    out_of_scope: [],
    risk_areas: risks.slice(0, MAX_RISK_AREAS),
    confidence: 'low',
  };
}
