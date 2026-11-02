import type { IntentClassification, PrIntentRecord, ReviewIntent } from '@devdigest/shared';
import { MAX_ITEM_CHARS, MAX_RISK_AREAS, MAX_SCOPE_ITEMS } from './constants.js';
import type { StoredIntent } from './types.js';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_CHARS);
const cleanList = (xs: string[], max: number) =>
  xs
    .map(clean)
    .filter((s) => s.length > 0)
    .slice(0, max);

/** Bound a classification before it is stored (lengths and counts; confidence is clamped by the service). */
export function trimClassification(c: IntentClassification): IntentClassification {
  return {
    intent: c.intent.replace(/\s+/g, ' ').trim().slice(0, 600),
    in_scope: cleanList(c.in_scope, MAX_SCOPE_ITEMS),
    out_of_scope: cleanList(c.out_of_scope, MAX_SCOPE_ITEMS),
    risk_areas: cleanList(c.risk_areas, MAX_RISK_AREAS),
    confidence: c.confidence,
  };
}

/** What reviewer-core receives. */
export function renderableIntent(s: StoredIntent): ReviewIntent {
  return {
    intent: s.intent,
    in_scope: s.inScope,
    out_of_scope: s.outOfScope,
    risk_areas: s.riskAreas,
    confidence: s.confidence,
    basis: s.basis,
  };
}

/** Stored intent → API DTO (snake_case). `stale` = the PR head moved since it was derived. */
export function toIntentRecord(prId: string, s: StoredIntent, currentHeadSha: string): PrIntentRecord {
  return {
    ...renderableIntent(s),
    pr_id: prId,
    method: s.method,
    sources: s.sources,
    head_sha: s.headSha,
    stale: s.headSha !== null && s.headSha !== currentHeadSha,
    provider: s.provider,
    model: s.model,
    tokens_in: s.tokensIn,
    tokens_out: s.tokensOut,
    cost_usd: s.costUsd,
    generated_at: s.generatedAt.toISOString(),
  };
}
