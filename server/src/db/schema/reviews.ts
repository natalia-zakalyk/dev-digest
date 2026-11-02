import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { agentRuns } from './runs';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    /** Deleting the agent keeps its reviews (history) with agent_id nulled. */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** The agent_run that produced this review (links the timeline run ↔ review).
     *  Deleting the run deletes the review (+ its findings via their cascade). */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    // PR page + PR-list rollups: "reviews of these PRs, newest first".
    prCreatedIdx: index('reviews_pr_created_idx').on(t.prId, t.createdAt.desc()),
    runIdx: index('reviews_run_idx').on(t.runId),
    // FK reviews.agent_id (ON DELETE SET NULL): without it deleting an agent seq-scans reviews.
    agentIdx: index('reviews_agent_idx').on(t.agentId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    reviewIdx: index('findings_review_idx').on(t.reviewId),
    // Mirrors the `Severity` enum in @devdigest/shared (contracts/findings.ts).
    severityChk: check(
      'findings_severity_chk',
      sql`${t.severity} IN ('CRITICAL', 'WARNING', 'SUGGESTION')`,
    ),
  }),
);

/** jsonb element of `pr_intent.sources` (mirrors IntentSource in @devdigest/shared). */
export interface StoredIntentSource {
  kind: string;
  ref: string;
  fetched: boolean;
  note: string | null;
}

export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    riskAreas: jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Mirrors IntentConfidence / IntentBasis / IntentMethod in @devdigest/shared (contracts/brief.ts).
    confidence: text('confidence').notNull().default('low'),
    basis: text('basis').notNull().default('inferred'),
    method: text('method').notNull().default('llm'),
    sources: jsonb('sources').$type<StoredIntentSource[]>().notNull().default(sql`'[]'::jsonb`),
    headSha: text('head_sha'),
    // Null for heuristic rows, so the next run retries the LLM.
    inputHash: text('input_hash'),
    provider: text('provider'),
    model: text('model'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    // Unknown cost is NULL, never 0 (same rule as agent_runs.cost_usd).
    costUsd: doublePrecision('cost_usd'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    confidenceChk: check('pr_intent_confidence_chk', sql`${t.confidence} IN ('high', 'medium', 'low')`),
    basisChk: check('pr_intent_basis_chk', sql`${t.basis} IN ('documented', 'inferred')`),
    methodChk: check('pr_intent_method_chk', sql`${t.method} IN ('llm', 'heuristic')`),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
