/* hooks/intent.ts — React Query hooks for the PR Intent card.
   Spec: client/specs/intent-layer.md */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { DeriveIntentBody, IntentResponse } from "@devdigest/shared";

/** Query options for a PR's stored intent (GET never calls the model). */
export const prIntentOptions = (prId: string) =>
  queryOptions({
    queryKey: ["pr-intent", prId] as const,
    queryFn: () => api.get<IntentResponse>(`/pulls/${prId}/intent`),
  });

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({ ...prIntentOptions(prId ?? ""), enabled: !!prId });
}

/** Derive now (`force: true` = Refresh). The response is the new stored intent. */
export function useDeriveIntent(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeriveIntentBody = {}) =>
      api.post<IntentResponse>(`/pulls/${prId}/intent`, body),
    onSuccess: (data) => qc.setQueryData(prIntentOptions(prId).queryKey, data),
  });
}
