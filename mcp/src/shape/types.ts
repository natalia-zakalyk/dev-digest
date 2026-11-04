/**
 * Domain input types: what the `DevDigestApi` port hands to the shaping functions.
 * The HTTP adapter maps tolerant API payloads into these (camelCase, no raw payloads,
 * no `system_prompt`). `severity` stays the API's raw string: the domain normalizes it.
 */

export interface FindingInput {
  id: string;
  /** Raw API value: the API sends `CRITICAL | WARNING | SUGGESTION`. */
  severity: string;
  file: string;
  startLine: number;
  title: string;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
  dismissedAt?: string | null;
}

export interface ReviewInput {
  id: string;
  agentId: string | null;
  agentName?: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  score: number | null;
  createdAt: string;
  findings: readonly FindingInput[];
  /** Findings the API sent that could not be read (malformed); they are not in `findings` or the counts. */
  unreadableFindings?: number;
}

export interface RunInput {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  /** Raw API value: running | done | failed | cancelled (nullable). */
  status: string | null;
  error: string | null;
}

export interface AgentInput {
  id: string;
  name: string;
  description: string;
  model: string;
  enabled: boolean;
}

export interface ConventionInput {
  rule: string;
  category?: string | null;
  evidencePath: string;
  evidenceLineStart?: number | null;
  evidenceLineEnd?: number | null;
  /** Raw API value: pending | accepted | rejected. */
  status: string;
}
