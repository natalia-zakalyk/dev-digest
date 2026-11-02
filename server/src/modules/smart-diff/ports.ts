/**
 * Read port owned by the service. `ReviewRepository` satisfies it structurally,
 * so the service never imports `db/rows`.
 */
export interface SmartDiffSource {
  getPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  getPrFiles(prId: string): Promise<{ path: string; additions: number; deletions: number }[]>;
  /** Newest first, each review with its findings. */
  reviewsForPull(prId: string): Promise<
    {
      review: { id: string; prId: string; agentId: string | null; runId: string | null; kind: string };
      findings: { id: string; file: string; startLine: number; dismissedAt: Date | null }[];
    }[]
  >;
  /** Token counts of the given agent runs; runs that no longer exist are simply absent. */
  runTokens(runIds: string[]): Promise<{ tokensIn: number | null; tokensOut: number | null }[]>;
}
