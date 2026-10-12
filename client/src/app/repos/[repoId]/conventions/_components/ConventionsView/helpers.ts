import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_OK, CONFIDENCE_WARN, type StatusFilter } from "./constants";

/** "path:start-end" (or "path:line" / bare "path" when lines are unknown). */
export function formatEvidence(c: Pick<ConventionCandidate, "evidence_path" | "evidence_line_start" | "evidence_line_end">): string {
  const { evidence_path: path, evidence_line_start: a, evidence_line_end: b } = c;
  if (a == null) return path;
  return b != null && b !== a ? `${path}:${a}-${b}` : `${path}:${a}`;
}

export function filterByStatus(list: ConventionCandidate[], filter: StatusFilter): ConventionCandidate[] {
  return filter === "all" ? list : list.filter((c) => c.status === filter);
}

export function countByStatus(list: ConventionCandidate[], filter: StatusFilter): number {
  return filterByStatus(list, filter).length;
}

/** Percent 0–100 for the confidence bar. */
export function confidencePct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function confidenceColor(pct: number): string {
  if (pct >= CONFIDENCE_OK) return "var(--ok)";
  if (pct >= CONFIDENCE_WARN) return "var(--warn)";
  return "var(--crit)";
}

/** Rough token estimate (≈ 4 chars/token) for the skill body counter. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
