/* hooks/conventions.ts — React Query hooks for the Conventions extractor.
   Spec: client/specs/conventions.md */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ConventionCandidate,
  ConventionExtractResponse,
  ConventionSkillDraft,
  ConventionsListResponse,
  UpdateConventionBody,
} from "@devdigest/shared";

const key = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionsListResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run sample → model → verify on the server; the response replaces the cached list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResponse>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Accept / reject / edit one candidate. Optimistic so the toggle feels instant. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionBody }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const prev = qc.getQueryData<ConventionsListResponse>(key(repoId));
      if (prev) {
        qc.setQueryData<ConventionsListResponse>(key(repoId), {
          ...prev,
          candidates: prev.candidates.map((c) =>
            c.id === id
              ? { ...c, ...patch, accepted: patch.status ? patch.status === "accepted" : c.accepted }
              : c,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key(repoId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Merge accepted conventions into an editable skill draft. Writes nothing. */
export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: (conventionIds: string[]) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, {
        convention_ids: conventionIds,
      }),
  });
}
