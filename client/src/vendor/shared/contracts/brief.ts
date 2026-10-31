import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Intent layer (derived PR motivation fed to the reviewers) ----
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentBasis = z.enum(['documented', 'inferred']);
export type IntentBasis = z.infer<typeof IntentBasis>;

export const IntentMethod = z.enum(['llm', 'heuristic']);
export type IntentMethod = z.infer<typeof IntentMethod>;

export const IntentSourceKind = z.enum([
  'title',
  'description',
  'linked_issue',
  'linked_doc',
  'branch',
  'commits',
  'file_paths',
  'diff_stats',
  'prior_prs',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  fetched: z.boolean(),
  note: z.string().nullable(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** LLM output schema. Every field required (strict json_schema has no optionals). */
export const IntentClassification = Intent.extend({
  risk_areas: z.array(z.string()),
  confidence: IntentConfidence,
});
export type IntentClassification = z.infer<typeof IntentClassification>;

/** What reviewer-core receives and renders into every agent's prompt. */
export const ReviewIntent = Intent.extend({
  risk_areas: z.array(z.string()),
  confidence: IntentConfidence,
  basis: IntentBasis,
});
export type ReviewIntent = z.infer<typeof ReviewIntent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
// Enum order = display order of the groups in the Files changed tab.
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
  // Ids of the counted findings on this file (same order as finding_lines, by line then id).
  finding_ids: z.array(z.string()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
