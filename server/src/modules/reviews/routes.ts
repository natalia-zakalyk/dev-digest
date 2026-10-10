import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RunRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { streamRunEvents } from '../../platform/sse.js';
import { ReviewService } from './service.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentId} | {all:true}  → run review(s); returns runs
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /pulls/:id/reviews                          → persisted reviews + findings for a PR
 *   POST   /findings/:id/(accept|dismiss)              → finding actions
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;

/** RunRequest body; an absent body (Fastify passes `null`) means "{}" (run defaults). */
const RunRequestBody = RunRequest.nullish().transform((b) => b ?? {});
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // Both body fields optional; an absent body defaults to {} — validated by the
  // zod type provider (→ 422).
  app.post(
    '/pulls/:id/review',
    {
      schema: { params: IdParams, body: RunRequestBody },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = req.body;
    const targets = await service.resolveTargets(workspaceId, {
      ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
      ...(body.all !== undefined ? { all: body.all } : {}),
    });
    const { runs, reviews } = await service.runReview(
      workspaceId,
      req.params.id,
      targets,
      req.log,
    );
    return { pr_id: req.params.id, runs, reviews };
  });

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const runId = req.params.id;

    // Unknown / other-workspace run → 404 instead of a never-ending stream.
    if (!(await service.runExists(workspaceId, runId))) {
      throw new NotFoundError('Run not found');
    }
    // A run this process doesn't hold in memory (evicted after completion, or
    // finished before a restart): a persisted trace means it finished → end
    // immediately; otherwise streamRunEvents waits a bounded grace for the
    // first event instead of hanging forever.
    const finished = !container.runBus.has(runId)
      ? Boolean(await service.getRunTrace(workspaceId, runId))
      : false;

    // Client disconnect → abort the pending wait and unsubscribe (the SSE plugin
    // only unpipes on close; it never calls return() on our iterator).
    const ac = new AbortController();
    // (`reply.raw`, not `req.raw`: IncomingMessage 'close' fires once the request
    // body is consumed, ServerResponse 'close' fires on connection teardown.)
    reply.raw.once('close', () => ac.abort());

    reply.sse(
      (async function* () {
        for await (const e of streamRunEvents(container.runBus, runId, {
          signal: ac.signal,
          finished,
        })) {
          yield { id: String(e.seq), event: e.kind, data: JSON.stringify(e) };
        }
        // Terminal marker so the browser can tell "run finished" from a network
        // blip (both otherwise look like a closed response → EventSource
        // auto-reconnects). Not sent on client abort or server shutdown.
        if (!ac.signal.aborted && (finished || container.runBus.isComplete(runId))) {
          yield { event: 'done', data: JSON.stringify({ runId }) };
        }
      })(),
    );
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get('/pulls/:id/runs/active', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  });

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get('/pulls/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.cancelRun(workspaceId, req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const trace = await service.getRunTrace(workspaceId, req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Reads --------------------------------------------------------------
  app.get('/pulls/:id/reviews', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  });

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Finding actions (accept / dismiss) ---------------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(`/findings/:id/${action}`, { schema: { params: IdParams } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.actOnFinding(workspaceId, req.params.id, action);
      return result;
    });
  }
}
