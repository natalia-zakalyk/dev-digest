"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SmartDiffResponse } from "@/lib/types";

/**
 * Role-grouped files of a PR + the finding ids that sit on each file.
 *
 * The key is intentionally NESTED under `["reviews", prId]`: TanStack prefix
 * invalidation then refreshes the dots and cards after every action that already
 * invalidates the PR's reviews (run review, accept/dismiss, run settled, deletes)
 * with no edits to `hooks/reviews.ts`.
 */
export const prSmartDiffOptions = (prId: string) =>
  queryOptions({
    queryKey: ["reviews", prId, "smart-diff"] as const,
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
  });

export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({ ...prSmartDiffOptions(prId ?? ""), enabled: !!prId });
}
