import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';

/** Persisted shape the mapper needs (structurally matches the `conventions` row; keeps this ring DB-free). */
export interface ConventionRecord {
  id: string;
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  confidence: number | null;
  status: ConventionStatus;
}

/** Persisted row → API DTO (snake_case contract). */
export function toConventionDto(row: ConventionRecord): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    category: row.category,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_line_start: row.evidenceLineStart,
    evidence_line_end: row.evidenceLineEnd,
    confidence: row.confidence ?? 0,
    accepted: row.status === 'accepted',
    status: row.status,
  };
}
