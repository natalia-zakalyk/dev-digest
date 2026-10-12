import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionSkillDraftBody, UpdateConventionBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createConventionsService } from './compose.js';

/**
 * Conventions extractor. Spec: server/specs/conventions.md
 *   POST  /repos/:id/conventions/extract      → sample → model → verify → persist
 *   GET   /repos/:id/conventions              → candidates (all statuses)
 *   PATCH /conventions/:id                    → accept / reject / edit
 *   POST  /repos/:id/conventions/skill-draft  → accepted ids → skill draft (writes nothing)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = createConventionsService(c);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: ConventionSkillDraftBody } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.skillDraft(workspaceId, req.params.id, req.body.convention_ids);
    },
  );
}
