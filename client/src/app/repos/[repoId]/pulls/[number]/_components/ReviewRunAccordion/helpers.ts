import type { FindingRecord } from "@devdigest/shared";

/** Locale date-time for the header; the raw string when unparseable. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Open (not dismissed) CRITICAL findings. */
export function countBlockers(findings: FindingRecord[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
