import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DeriveIntentBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createIntentService } from './compose.js';

/** An absent body (Fastify passes `null`) means "{}" — same convention as POST /pulls/:id/review. */
const DeriveBody = DeriveIntentBody.nullish().transform((b) => b ?? {});

/**
 * Intent layer. Spec: server/specs/intent-layer.md
 *   GET  /pulls/:id/intent  → stored intent (`{intent:null}` when not derived yet); never calls the model
 *   POST /pulls/:id/intent  → derive now ({force?}); rate-limited, one cheap model call
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = createIntentService(c);

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, body: DeriveBody },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.deriveRecord(workspaceId, req.params.id, { force: req.body.force ?? false });
    },
  );
}
