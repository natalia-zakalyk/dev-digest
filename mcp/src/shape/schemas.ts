import { z } from 'zod';
import { DETAIL_LEVELS, SEVERITIES } from '../constants.js';

/** Output shapes (snake_case like the API contracts). The tools ring reuses them as `outputSchema`. */

export const Severity = z.enum(SEVERITIES);
export type Severity = z.infer<typeof Severity>;

export const DetailLevel = z.enum(DETAIL_LEVELS);
export type DetailLevel = z.infer<typeof DetailLevel>;

export const Counts = z.object({
  critical: z.number().int(),
  warning: z.number().int(),
  suggestion: z.number().int(),
});
export type Counts = z.infer<typeof Counts>;

export const ConciseFinding = z.object({
  id: z.string(),
  severity: Severity,
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
});
export type ConciseFinding = z.infer<typeof ConciseFinding>;

export const FullFinding = ConciseFinding.extend({
  rationale: z.string(),
  suggestion: z.string().nullable(),
  confidence: z.number(),
});
export type FullFinding = z.infer<typeof FullFinding>;

export const ShapedFinding = z.union([FullFinding, ConciseFinding]);
export type ShapedFinding = z.infer<typeof ShapedFinding>;

const Verdict = z.string().nullable();
const Score = z.number().int().nullable();

export const AgentSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

export const ListAgentsResult = z.object({ agents: z.array(AgentSummary) });
export type ListAgentsResult = z.infer<typeof ListAgentsResult>;

export const RunDoneResult = z.object({
  status: z.literal('done'),
  run_id: z.string(),
  verdict: Verdict,
  score: Score,
  counts: Counts,
  findings: z.array(ShapedFinding),
  truncated: z.boolean().optional(),
  total: z.number().int().optional(),
  hint: z.string().optional(),
});
export type RunDoneResult = z.infer<typeof RunDoneResult>;

export const RunRunningResult = z.object({
  status: z.literal('running'),
  run_id: z.string(),
  next: z.string(),
});
export type RunRunningResult = z.infer<typeof RunRunningResult>;

export const RunFailedResult = z.object({
  status: z.literal('failed'),
  run_id: z.string(),
  error: z.string(),
});
export type RunFailedResult = z.infer<typeof RunFailedResult>;

export const ReviewEntry = z.object({
  agent: z.string().nullable(),
  run_id: z.string().nullable(),
  verdict: Verdict,
  score: Score,
  counts: Counts,
  findings: z.array(ShapedFinding),
});
export type ReviewEntry = z.infer<typeof ReviewEntry>;

/** `get_findings` without `run_id`: latest review of each agent. */
export const ReviewsResult = z.object({
  status: z.literal('done'),
  pr: z.number().int(),
  reviews: z.array(ReviewEntry),
  truncated: z.boolean().optional(),
  total: z.number().int().optional(),
  hint: z.string().optional(),
});
export type ReviewsResult = z.infer<typeof ReviewsResult>;

export const BlastCounts = z.object({
  symbols: z.number().int(),
  callers: z.number().int(),
  endpoints: z.number().int(),
  crons: z.number().int(),
});
export type BlastCounts = z.infer<typeof BlastCounts>;

export const BlastCaller = z.object({ name: z.string(), file: z.string(), line: z.number().int() });
export type BlastCaller = z.infer<typeof BlastCaller>;

export const BlastDownstream = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type BlastDownstream = z.infer<typeof BlastDownstream>;

/** `get_blast_radius` answer (spec): the same map the studio's Overview card shows. Object root. */
export const BlastRadiusResult = z.object({
  repo: z.string(),
  pr: z.number().int(),
  summary: z.string(),
  counts: BlastCounts,
  degraded: z.boolean(),
  reason: z.string().optional(),
  hint: z.string().optional(),
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string() })),
  downstream: z.array(BlastDownstream),
  truncated: z.boolean().optional(),
});
export type BlastRadiusResult = z.infer<typeof BlastRadiusResult>;

export const ConventionEntry = z.object({
  rule: z.string(),
  category: z.string().nullable(),
  evidence: z.string(),
});
export type ConventionEntry = z.infer<typeof ConventionEntry>;

export const ConventionsResult = z.object({
  repo: z.string(),
  conventions: z.array(ConventionEntry),
  total: z.number().int(),
  truncated: z.boolean().optional(),
  hint: z.string().optional(),
});
export type ConventionsResult = z.infer<typeof ConventionsResult>;

/**
 * `outputSchema` roots for tools whose answer has several variants. MCP requires an object root
 * (a bare `anyOf` is wrapped as `{result: …}` for 2025-era clients), so the variants are merged
 * into one envelope: `status` tells which fields are present.
 */
export const RunAgentOnPrOutput = RunDoneResult.omit({ status: true, run_id: true })
  .partial()
  .extend({
    status: z.enum(['done', 'running', 'failed']),
    run_id: z.string(),
    next: z.string().optional(),
    error: z.string().optional(),
  });
export type RunAgentOnPrOutput = z.infer<typeof RunAgentOnPrOutput>;

export const GetFindingsOutput = RunAgentOnPrOutput.extend({
  pr: z.number().int().optional(),
  reviews: z.array(ReviewEntry).optional(),
  // Loosened from the base schema: a reviews listing has no single run.
  run_id: z.string().optional(),
});
export type GetFindingsOutput = z.infer<typeof GetFindingsOutput>;
