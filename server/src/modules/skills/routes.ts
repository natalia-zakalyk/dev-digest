import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateSkillBody, SkillImportRequest, UpdateSkillBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { IMPORT_BODY_LIMIT_BYTES } from './constants.js';
import { SkillsService } from './service.js';

/**
 * L02 — skills module. Spec: server/specs/skills.md
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/summary          → per-skill rollup (agents_count, pull_frequency, accept_rate)
 *   GET    /skills/:id              → one skill
 *   GET    /skills/:id/versions     → body snapshots, newest first
 *   GET    /skills/:id/stats        → 30-day usage (agents, pull frequency, accept rate, findings)
 *   POST   /skills                  → create (manual or confirmed import)
 *   PUT    /skills/:id              → edit / toggle enabled (body change bumps version)
 *   DELETE /skills/:id              → delete (links + versions cascade)
 *   POST   /skills/import/preview   → parse a .md / .zip into a preview; writes nothing
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  // Registered before `/skills/:id` so the param route doesn't capture it.
  app.get('/skills/summary', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.summary(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: SkillImportRequest }, bodyLimit: IMPORT_BODY_LIMIT_BYTES },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );
}
