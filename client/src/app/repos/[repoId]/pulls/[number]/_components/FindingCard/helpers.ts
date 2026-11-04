import { SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** A finding's severity as a known `Severity` (unknown strings read as INFO; own keys only, so "constructor" is unknown). */
export function toSeverity(severity: string): Severity {
  return Object.hasOwn(SEV, severity) ? (severity as Severity) : "INFO";
}
