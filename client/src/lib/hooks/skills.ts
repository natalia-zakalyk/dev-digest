/* hooks/skills.ts — React Query hooks for the L02 Skills page and the agent
   editor's Skills tab. Spec: client/specs/skills.md */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AgentSkillLink,
  CreateSkillBody,
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillStats,
  SkillSummary,
  SkillVersion,
  UpdateSkillBody,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

/** Per-skill card numbers (agents, pull frequency, accept rate; 30 days). */
export function useSkillSummaries() {
  return useQuery({
    queryKey: ["skills", "summary"],
    queryFn: () => api.get<SkillSummary[]>("/skills/summary"),
  });
}

/** Body snapshots of one skill, newest first. Under ["skills", id] so any skill mutation refreshes it. */
export function useSkillVersions(id: string) {
  return useQuery({
    queryKey: ["skills", id, "versions"],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
  });
}

/** 30-day usage of one skill (agents, pull frequency, accept rate, findings). */
export function useSkillStats(id: string) {
  return useQuery({
    queryKey: ["skills", id, "stats"],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
  });
}

/** Input to POST /skills — the server fills defaults (description "", source "manual"). */
export type CreateSkillInput = Omit<CreateSkillBody, "description"> & { description?: string };

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSkillBody }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      // Links cascade on the server — agent skill lists and counts change too.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/** Parse an uploaded .md / .zip into a preview. Writes nothing on the server. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: SkillImportRequest) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace the agent's ordered skill set (link / unlink / reorder in one call).
 * Optimistic: the Skills tab reflects the change immediately and rolls back on error.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", agentId];
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async (skillIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
}
