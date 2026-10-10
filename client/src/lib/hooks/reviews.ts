/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. */
"use client";

import React from "react";
import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { notify } from "../toast";
import type {
  FindingActionKind,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
} from "@devdigest/shared";

// ---- Active (in-flight) runs — server-side source of truth ----
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** Poll interval (ms) for active runs / run history while anything is running. */
const RUN_POLL_MS = 4000;

/** Query options (key + fn together) for a PR's in-flight runs. */
export const prActiveRunsOptions = (prId: string) =>
  queryOptions({
    queryKey: ["pr-active-runs", prId] as const,
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
  });

/** Query options for a PR's full run history (every agent_runs row). */
export const prRunsOptions = (prId: string) =>
  queryOptions({
    queryKey: ["pr-runs", prId] as const,
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
  });

/** Query options for a PR's persisted reviews + findings. */
export const prReviewsOptions = (prId: string) =>
  queryOptions({
    queryKey: ["reviews", prId] as const,
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
  });

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    ...prActiveRunsOptions(prId ?? ""),
    enabled: !!prId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? RUN_POLL_MS : false),
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    ...prRunsOptions(prId ?? ""),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? RUN_POLL_MS : false,
  });
}

// ---- Persisted reviews + findings for a PR ----
export function usePrReviews(prId: string | null | undefined) {
  return useQuery({ ...prReviewsOptions(prId ?? ""), enabled: !!prId });
}

/**
 * Cache invalidation for a PR's run state, so screens never build key tuples.
 * `activeRuns` — after starting runs; `runSettled` — when live runs finish
 * (done OR failed): refresh active runs, run history and reviews together.
 */
export function useInvalidatePrRuns(prId: string | null | undefined) {
  const qc = useQueryClient();
  return React.useMemo(
    () => ({
      activeRuns: () => {
        if (prId) void qc.invalidateQueries({ queryKey: prActiveRunsOptions(prId).queryKey });
      },
      runSettled: () => {
        if (!prId) return;
        void qc.invalidateQueries({ queryKey: prActiveRunsOptions(prId).queryKey });
        void qc.invalidateQueries({ queryKey: prRunsOptions(prId).queryKey });
        void qc.invalidateQueries({ queryKey: prReviewsOptions(prId).queryKey });
      },
    }),
    [qc, prId],
  );
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // both the timeline and the Review Runs list from cache.
    onSuccess: () => {
      if (!prId) return;
      void qc.invalidateQueries({ queryKey: prRunsOptions(prId).queryKey });
      void qc.invalidateQueries({ queryKey: prReviewsOptions(prId).queryKey });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", prId] }),
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

export interface CreateCommentInput {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  in_reply_to?: number;
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  all?: boolean;
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(all ? { all } : {}),
      }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
      prId: _prId,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId?: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => {
      if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

/** Named SSE events the server emits (`event: <kind>`), see RunEventKind. */
const RUN_EVENT_KINDS = ["info", "tool", "result", "error"] as const;

/**
 * Subscribe to a run's SSE event stream. Returns the accumulated RunEvents and a
 * `running` flag (true until every stream has ended). Live status for the
 * RunReviewDropdown / Live Log. Multiple runIds are subscribed in parallel.
 *
 * Lifecycle: the server replays the run's buffer, streams live events and, when
 * the run completes, sends a terminal `event: done` before ending the response
 * → we close on it. Without it (older server, or a run that ended while we were
 * disconnected) a clean end and a network blip both reach us as `onerror` with
 * `readyState === CONNECTING` (the browser auto-reconnects), so:
 * - `readyState === CLOSED` (the browser gave up) → the stream is over.
 * - CONNECTING → let EventSource reconnect. The server replays the buffer on
 *   every connect, so events are de-duplicated by `seq`; a connection that
 *   opened but delivered nothing new before ending is the replay-then-end of a
 *   finished run → close it ourselves (otherwise it would reconnect forever).
 */
export function useRunEvents(runIds: string[]) {
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [running, setRunning] = React.useState(false);
  const key = runIds.join(",");

  React.useEffect(() => {
    if (runIds.length === 0) return;
    setEvents([]);
    setRunning(true);
    const sources: EventSource[] = [];
    let open = runIds.length;

    for (const runId of runIds) {
      const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
      let lastSeq = 0;
      let opened = false;
      let freshSinceOpen = false;
      let ended = false;

      const end = () => {
        es.close();
        if (ended) return;
        ended = true;
        open -= 1;
        if (open <= 0) setRunning(false);
      };

      const onMsg = (ev: MessageEvent) => {
        let parsed: RunEvent;
        try {
          parsed = JSON.parse(ev.data) as RunEvent;
        } catch {
          return; /* ignore non-JSON keepalive frames (and dataless native error events) */
        }
        // Replayed on reconnect → already seen.
        if (typeof parsed.seq === "number") {
          if (parsed.seq <= lastSeq) return;
          lastSeq = parsed.seq;
        }
        freshSinceOpen = true;
        setEvents((prev) => [...prev, parsed]);
        // Runtime agent failures arrive as SSE `error` events (not as a
        // mutation/query error), so the global error toast never sees them —
        // surface them here so the user gets a notification without a reload.
        if (parsed.kind === "error" && parsed.msg) notify.error(parsed.msg);
      };
      // The server tags events with kind as the SSE `event:` name AND emits them
      // as default messages too in some clients — listen broadly (seq dedupes).
      es.onmessage = onMsg;
      for (const kind of RUN_EVENT_KINDS) {
        es.addEventListener(kind, onMsg as EventListener);
      }
      // Terminal marker from the server: the run finished → stop, no reconnect.
      es.addEventListener("done", () => end());
      es.onopen = () => {
        opened = true;
        freshSinceOpen = false;
      };
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return end();
        // CONNECTING: transient drop → keep the auto-reconnect, unless this
        // connection was just the replay of an already-finished run.
        if (opened && !freshSinceOpen) return end();
        opened = false;
      };
      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
      setRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { events, running };
}
