import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import {
  validatorCompiler,
  serializerCompiler,
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { loadConfig, type AppConfig } from './platform/config.js';
import { createDb, type Db } from './db/client.js';
import { Container, type ContainerOverrides } from './platform/container.js';
import { AppError } from './platform/errors.js';
import { modules } from './modules/index.js';
import { ReviewService } from './modules/reviews/service.js';

// Attach the DI container to every request/instance.
declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
  db?: Db;
  overrides?: ContainerOverrides;
  /** Max time app.close() waits for in-flight jobs (default SHUTDOWN_JOB_DEADLINE_MS). */
  shutdownDeadlineMs?: number;
}

/** How long graceful shutdown waits for in-flight jobs before closing the DB. */
export const SHUTDOWN_JOB_DEADLINE_MS = 10_000;

/**
 * Pino redaction — credentials must never reach logs (request headers, provider
 * SDK errors that echo their request config, any `token`/`apiKey` field).
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers["x-api-key"]',
  'err.request.headers.authorization',
  'err.request.headers["x-api-key"]',
  'err.headers.authorization',
  'err.config.headers.Authorization',
  'err.config.headers.authorization',
  'err.response.request.headers.authorization',
  'token',
  'apiKey',
  'key',
  '*.token',
  '*.apiKey',
  '*.api_key',
  '*.key',
  '*.password',
  '*.secret',
];

/** Status → stable error code for 4xx errors that aren't AppErrors. */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  406: 'not_acceptable',
  408: 'request_timeout',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'validation_error',
  429: 'rate_limited',
};

const INTERNAL_ERROR = { error: { code: 'internal_error', message: 'Internal error' } } as const;

/**
 * buildApp() — exported so tests can use `app.inject()` without a real port.
 * Wires the zod type provider (request validation + response serialization),
 * the security/transport plugins (helmet, cors, rate-limit, SSE) ahead of the
 * DI container and the statically-registered feature modules, plus a structured
 * error handler returning the ApiErrorBody envelope.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();
  const handle = opts.db ? null : createDb(config.databaseUrl);
  const db = opts.db ?? handle!.db;

  const app = Fastify({
    // Explicit 1MB cap on request bodies (PR comments, settings payloads are
    // small). Protects against oversized/abusive payloads.
    bodyLimit: 1_048_576,
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' },
            transport:
              config.nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
          },
  });

  // Use zod schemas directly for request validation + response serialization.
  // Routes opt in per-module via `app.withTypeProvider<ZodTypeProvider>()`.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const container = new Container(config, db, opts.overrides);
  app.decorate('container', container);

  // Reap runs left 'running' by a previous (now-dead) process — otherwise they
  // show as perpetually "running" in the UI and can't be cancelled (no runner).
  //
  // AWAITED before the server accepts requests: a fresh process has no in-flight
  // runs of its own yet (runs only start via POST /review once listening), so
  // every 'running' row here is genuinely orphaned. Awaiting also closes the
  // race where a brand-new run could be created (and wrongly reaped) in the gap
  // between listening and an async reaper finishing.
  // NOTE: assumes a SINGLE API instance per DB. With multiple replicas this
  // would need per-instance scoping / heartbeats (not this app's deployment).
  try {
    const reaped = await new ReviewService(container).reapStaleRuns();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running agent_runs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'stale-run reaping failed (non-fatal)');
  }

  // Security headers (X-Content-Type-Options, X-Frame-Options, …). The API
  // serves JSON only, so the default CSP is fine.
  await app.register(helmet);
  await app.register(cors, { origin: [config.webOrigin], credentials: true });
  await app.register(FastifySSEPlugin);

  // Global rate limit. Disabled under test so integration suites can hammer
  // endpoints via inject(); per-route overrides live on the routes themselves.
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  // Liveness check (no module, no DB, no rate limit).
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  // Readiness check — verifies the DB is reachable with a cheap `SELECT 1`.
  // 503 (not 500) so orchestrators treat it as "not ready yet", not a crash.
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ready: true };
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'readiness check failed: db unreachable');
      return reply.status(503).send({ ready: false });
    }
  });

  // Structured error handler. Registered BEFORE modules so encapsulated
  // module plugins inherit it.
  //   request validation → 422 · AppError → its status · other 4xx → mapped
  //   code · everything else (incl. INTERNAL ZodErrors from parsing DB rows /
  //   traces) → 500 with a generic message (detail only in the log).
  app.setErrorHandler((err: unknown, req, reply) => {
    // Request validation failure: zod type provider (schema.body/params/query)
    // or Fastify's own validator (err.validation + FST_ERR_VALIDATION).
    const fe = err as { validation?: unknown; code?: string; statusCode?: number; message?: string };
    if (hasZodFastifySchemaValidationErrors(err) || (fe?.validation && fe.code === 'FST_ERR_VALIDATION')) {
      reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: fe.validation,
        },
      });
      return;
    }
    // Response failed its own serialization schema — never leak the raw object;
    // log it and return a generic 500.
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response serialization failed');
      reply.status(500).send(INTERNAL_ERROR);
      return;
    }
    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.error({ err }, 'request failed');
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    // A ZodError reaching here is NOT a request-validation error (those are
    // handled above) — it's server data (DB row, trace) failing its contract:
    // a 500, logged. `instanceof` can fail across duplicate zod instances, so
    // the shape check stays; it only affects logging now.
    const status = typeof fe?.statusCode === 'number' ? fe.statusCode : 500;
    if (status >= 400 && status < 500) {
      reply.status(status).send({
        error: { code: CODE_BY_STATUS[status] ?? 'client_error', message: fe.message ?? 'Bad request' },
      });
      return;
    }
    const isZod = err instanceof z.ZodError || (err as { name?: string })?.name === 'ZodError';
    req.log.error({ err }, isZod ? 'internal data failed schema validation' : 'unhandled error');
    reply.status(status >= 500 && status < 600 ? status : 500).send(INTERNAL_ERROR);
  });

  // Unknown routes → the same structured envelope as every other error.
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `Route ${req.method} ${req.url.split('?')[0]} not found` },
    });
  });

  // Register feature modules from the static registry (src/modules/index.ts).
  // Each module is a Fastify plugin in modules/<name>/routes.ts.
  for (const plugin of Object.values(modules)) {
    await app.register(plugin);
  }

  // Graceful shutdown. preClose runs BEFORE the HTTP server stops accepting /
  // waits for connections — end open SSE streams there, or close() would wait
  // on them forever. onClose then waits (bounded) for in-flight jobs before the
  // DB pool closes underneath them.
  app.addHook('preClose', async () => {
    container.runBus.endAllStreams();
  });
  const shutdownDeadlineMs = opts.shutdownDeadlineMs ?? SHUTDOWN_JOB_DEADLINE_MS;
  app.addHook('onClose', async () => {
    const drained = await container.jobs.drain(shutdownDeadlineMs);
    if (!drained) app.log.warn({ shutdownDeadlineMs }, 'shutdown: jobs still running at deadline');
    // Close the db handle we created — in the same hook so it's strictly AFTER
    // the job drain (hook ordering across addHook calls isn't relied upon).
    if (handle) await handle.close();
  });

  return app;
}
