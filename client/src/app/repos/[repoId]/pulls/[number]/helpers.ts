/** Pure helpers for the PR detail route (no React). */

import type { Crumb } from "@devdigest/ui";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";

/** The route is keyed by PR number, every PR API by the row's uuid → resolve via the pulls list. */
export function resolvePrId(pulls: PrMeta[] | undefined, number: string | number): string | null {
  const n = Number(number);
  if (!pulls || !Number.isInteger(n)) return null;
  return pulls.find((p) => p.number === n)?.id ?? null;
}

/** Every finding across a PR's review runs (reviews come newest-first). */
export function collectFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return (reviews ?? []).flatMap((r) => r.findings);
}

/** Findings flagged as a lethal trifecta (drives the Agent-runs banner). */
export function lethalTrifectaFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.kind === "lethal_trifecta");
}

/** The review a run produced (for the trace drawer's title + findings). */
export function findRun(reviews: ReviewRecord[] | undefined, runId: string | null): ReviewRecord | undefined {
  if (!runId) return undefined;
  return (reviews ?? []).find((r) => r.run_id === runId);
}

/** Breadcrumb: `owner/repo › Pull Requests › #n`. */
export function buildPrCrumb(opts: {
  repoId: string;
  number: string | number;
  repoName: string;
  pullsLabel: string;
}): Crumb[] {
  const pullsHref = `/repos/${opts.repoId}/pulls`;
  return [
    { label: opts.repoName, mono: true, href: pullsHref },
    { label: opts.pullsLabel, href: pullsHref },
    { label: `#${opts.number}`, mono: true },
  ];
}
