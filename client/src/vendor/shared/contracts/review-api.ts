import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { BlastCaller, BlastRadius, DownstreamImpact, IntentMethod, IntentSource, ReviewIntent, SmartDiff } from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** Intent persisted for a PR (the ReviewIntent plus provenance and cost). */
export const PrIntentRecord = ReviewIntent.extend({
  pr_id: z.string(),
  method: IntentMethod,
  sources: z.array(IntentSource),
  head_sha: z.string().nullable(),
  /** True when the PR head moved since this intent was derived. */
  stale: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  // USD; null when unknown (never 0 for unknown).
  cost_usd: z.number().nullable(),
  generated_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

export const IntentResponse = z.object({ intent: PrIntentRecord.nullable() });
export type IntentResponse = z.infer<typeof IntentResponse>;

export const DeriveIntentBody = z.object({ force: z.boolean().optional() });
export type DeriveIntentBody = z.infer<typeof DeriveIntentBody>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;

/** Why a blast-radius answer is degraded (index missing, partial or switched off). */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastCounts = z.object({
  symbols: z.number().int(),
  callers: z.number().int(),
  endpoints: z.number().int(),
  crons: z.number().int(),
});
export type BlastCounts = z.infer<typeof BlastCounts>;

/**
 * A caller with the endpoints/crons reached THROUGH ITS OWN FILE (repo-intel `factsByFile`).
 * Optional: older servers send only the symbol-level union in `endpoints_affected` of the group.
 */
export const BlastCallerWithFacts = BlastCaller.extend({
  endpoints_affected: z.array(z.string()).optional(),
  crons_affected: z.array(z.string()).optional(),
});
export type BlastCallerWithFacts = z.infer<typeof BlastCallerWithFacts>;

/** Blast radius of a PR (`GET /pulls/:id/blast`): the BlastRadius map plus counts and index state. */
export const BlastRadiusResponse = BlastRadius.extend({
  downstream: z.array(DownstreamImpact.extend({ callers: z.array(BlastCallerWithFacts) })),
  counts: BlastCounts,
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullish(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
