import type { IntentBasis, IntentConfidence, IntentMethod, IntentSource } from '@devdigest/shared';

/** Pure domain types of the intent layer (no I/O) — shared by domain/, helpers and ports. */

/** The PR facts the intent layer reads (domain shape, never a Drizzle row). */
export interface PullInfo {
  id: string;
  repoId: string;
  owner: string;
  repoName: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface PrFileStat {
  path: string;
  additions: number;
  deletions: number;
}

export interface PrInputs {
  pull: PullInfo;
  files: PrFileStat[];
  /** First line of each commit message. */
  commitSubjects: string[];
}

/** Another PR in the same repo that touched some of the same files. */
export interface PriorPr {
  number: number;
  title: string;
  overlap: number;
}

/** A persisted intent (domain shape). */
export interface StoredIntent {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: string[];
  confidence: IntentConfidence;
  basis: IntentBasis;
  method: IntentMethod;
  sources: IntentSource[];
  headSha: string | null;
  /** Null for heuristic rows, so the next run retries the model. */
  inputHash: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  generatedAt: Date;
}
