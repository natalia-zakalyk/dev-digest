"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BlastRadiusResponse } from "@/lib/types";

/**
 * Blast radius of a PR: changed symbols, their callers, endpoints and crons.
 *
 * Not nested under `["reviews", prId]`: the map comes from the repo-intel index and does not
 * depend on review runs. A resync invalidates the `["blast"]` prefix instead.
 */
export const prBlastOptions = (prId: string) =>
  queryOptions({
    queryKey: ["blast", prId] as const,
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
  });

export function usePrBlast(prId: string | null | undefined) {
  return useQuery({ ...prBlastOptions(prId ?? ""), enabled: !!prId });
}
