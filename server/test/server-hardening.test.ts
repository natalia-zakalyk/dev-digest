import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { z } from 'zod';
import { buildApp, LOG_REDACT_PATHS } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { RunBus, streamRunEvents, type TimerFn } from '../src/platform/sse.js';
import { RipgrepCodeIndex } from '../src/adapters/codeindex/ripgrep.js';
import { AppError } from '../src/platform/errors.js';
import type { SecretsProvider, SecretKey } from '@devdigest/shared';
import {
  MockAuthProvider,
  MockGitHubClient,
  MockLLMProvider,
} from '../src/adapters/mocks.js';

/** Hermetic (no DB, no network, no keys) regressions for the server-hardening batch. */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Manual clock for RunBus / stream timers. */
function manualTimer() {
  const pending: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const timer: TimerFn = (fn, ms) => {
    const t = { fn, ms, cancelled: false };
    pending.push(t);
    return { cancel: () => (t.cancelled = true) };
  };
  const fire = () => {
    for (const t of pending.splice(0)) if (!t.cancelled) t.fn();
  };
  return { timer, pending, fire };
}

class SpySecrets implements SecretsProvider {
  store: Record<string, string> = {};
  sets: [string, string][] = [];
  async get(key: SecretKey) {
    return this.store[key];
  }
  async set(key: SecretKey, value: string) {
    this.sets.push([key, value]);
    this.store[key] = value;
  }
}

describe('error handler (BE-F5/F6/F15)', () => {
  async function appWithBoomRoutes() {
    const app = await buildApp({ config });
    app.get('/__t/boom', async () => {
      throw new Error('db password=hunter2 leaked');
    });
    app.get('/__t/zod', async () => z.object({ a: z.string() }).parse({ a: 1 }));
    app.get('/__t/429', async () => {
      throw Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 });
    });
    app.get('/__t/app-error', async () => {
      throw new AppError('conflict_thing', 'Already exists', 409);
    });
    return app;
  }

  it('unknown error → 500 with a generic message (no detail leak)', async () => {
    const app = await appWithBoomRoutes();
    const res = await app.inject({ method: 'GET', url: '/__t/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'internal_error', message: 'Internal error' } });
    expect(res.payload).not.toContain('hunter2');
    await app.close();
  });

  it('internal ZodError (server data) → 500, not 422', async () => {
    const app = await appWithBoomRoutes();
    const res = await app.inject({ method: 'GET', url: '/__t/zod' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    await app.close();
  });

  it('request validation → 422 validation_error', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'nope' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('429 → rate_limited (not internal_error)', async () => {
    const app = await appWithBoomRoutes();
    const res = await app.inject({ method: 'GET', url: '/__t/429' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toEqual({ code: 'rate_limited', message: 'Rate limit exceeded' });
    await app.close();
  });

  it('AppError keeps its status/code', async () => {
    const app = await appWithBoomRoutes();
    const res = await app.inject({ method: 'GET', url: '/__t/app-error' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('conflict_thing');
    await app.close();
  });

  it('malformed JSON body → 400 bad_request', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
    await app.close();
  });

  it('unknown route → 404 not_found envelope', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/does-not-exist?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'not_found', message: 'Route GET /does-not-exist not found' },
    });
    await app.close();
  });
});

describe('pino redaction (BE-F16)', () => {
  it('redacts auth headers, tokens and api keys', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const app = Fastify({
      logger: { level: 'info', stream, redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' } },
    });
    app.log.info({
      req: { headers: { authorization: 'Bearer sekret-1' } },
      provider: { apiKey: 'sk-sekret-2', token: 'ghp_sekret3' },
      err: { request: { headers: { authorization: 'token sekret-4' } } },
    });
    await app.close();
    const out = lines.join('');
    expect(out).toContain('[redacted]');
    for (const s of ['sekret-1', 'sk-sekret-2', 'ghp_sekret3', 'sekret-4']) expect(out).not.toContain(s);
  });
});

describe('POST /settings/test-connection persists only after success (BE-F12)', () => {
  it('failing candidate key is NOT saved', async () => {
    const secrets = new SpySecrets();
    secrets.store.OPENAI_API_KEY = 'old-working-key';
    const failing = new MockLLMProvider('openai');
    failing.listModels = async () => {
      throw new Error('401 invalid key');
    };
    const app = await buildApp({
      config,
      overrides: { auth: new MockAuthProvider(), secrets, llm: { openai: failing } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai', key: 'typo-key' },
    });
    expect(res.json()).toMatchObject({ provider: 'openai', ok: false });
    expect(secrets.sets).toEqual([]);
    expect(secrets.store.OPENAI_API_KEY).toBe('old-working-key');
    await app.close();
  });

  it('working candidate key is saved', async () => {
    const secrets = new SpySecrets();
    const app = await buildApp({
      config,
      overrides: {
        auth: new MockAuthProvider(),
        secrets,
        github: new MockGitHubClient({ login: 'octocat' }),
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github', key: 'ghp_new' },
    });
    expect(res.json()).toMatchObject({ ok: true, message: 'Connected as @octocat' });
    expect(secrets.sets).toEqual([['GITHUB_TOKEN', 'ghp_new']]);
    await app.close();
  });

  it('resolves the request context (auth) like other routes', async () => {
    const auth = new MockAuthProvider();
    const spy = vi.spyOn(auth, 'currentWorkspace');
    const app = await buildApp({
      config,
      overrides: { auth, github: new MockGitHubClient({ login: 'x' }) },
    });
    await app.inject({ method: 'POST', url: '/settings/test-connection', payload: { provider: 'github' } });
    expect(spy).toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /pulls/:id/review body schema (BE-F7)', () => {
  const url = '/pulls/00000000-0000-4000-8000-000000000000/review';
  it('invalid body → 422 from the route schema', async () => {
    const app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
    const res = await app.inject({ method: 'POST', url, payload: { all: 'yes' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
  it.each([
    ['absent body', undefined],
    ['empty object', {}],
  ])('%s passes validation', async (_n, payload) => {
    const app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
    const res = await app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
    expect(res.statusCode).not.toBe(422);
    await app.close();
  });
});

describe('GET /workspace uses the zod type provider (BE-F18)', () => {
  it('still answers via the shared error envelope (no DB → structured 500)', async () => {
    const app = await buildApp({
      config,
      overrides: {
        auth: {
          currentUser: async () => ({ id: 'u', email: 'e', name: 'n' }),
          currentWorkspace: async () => {
            throw new Error('boom');
          },
        },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    await app.close();
  });
});

describe('RunBus / SSE lifecycle (BE-F9)', () => {
  it('client disconnect (abort) ends the stream and unsubscribes', async () => {
    const bus = new RunBus();
    bus.publish('r1', 'info', 'hello');
    const ac = new AbortController();
    const it = streamRunEvents(bus, 'r1', { signal: ac.signal });
    const first = await it.next();
    expect(first.value?.msg).toBe('hello');
    expect(bus.listenerCount('r1')).toBe(1);
    const pending = it.next(); // parked waiting for the next event
    ac.abort();
    expect((await pending).done).toBe(true);
    expect(bus.listenerCount('r1')).toBe(0);
  });

  it('completed run: replays the buffer then ends', async () => {
    const bus = new RunBus();
    bus.publish('r2', 'info', 'a');
    bus.publish('r2', 'result', 'b');
    bus.complete('r2');
    const got: string[] = [];
    for await (const e of streamRunEvents(bus, 'r2')) got.push(e.msg);
    expect(got).toEqual(['a', 'b']);
    expect(bus.listenerCount('r2')).toBe(0);
  });

  it('run never published: ends after the grace instead of hanging, and leaks nothing', async () => {
    const clock = manualTimer();
    const bus = new RunBus({ timer: clock.timer, unknownRunGraceMs: 1000 });
    const it = streamRunEvents(bus, 'ghost');
    const pending = it.next();
    expect(clock.pending.map((t) => t.ms)).toEqual([1000]);
    clock.fire();
    expect((await pending).done).toBe(true);
    expect(bus.has('ghost')).toBe(false);
  });

  it('finished (persisted trace, evicted from memory) → ends immediately', async () => {
    const bus = new RunBus();
    const it = streamRunEvents(bus, 'old', { finished: true });
    expect((await it.next()).done).toBe(true);
  });

  it('evicts a completed run after the TTL', () => {
    const clock = manualTimer();
    const bus = new RunBus({ timer: clock.timer, bufferTtlMs: 5000 });
    bus.publish('r3', 'info', 'x');
    bus.complete('r3');
    expect(bus.buffer('r3')).toHaveLength(1);
    expect(clock.pending.map((t) => t.ms)).toEqual([5000]);
    clock.fire();
    expect(bus.has('r3')).toBe(false);
    expect(bus.buffer('r3')).toEqual([]);
  });

  it('endAllStreams (shutdown) ends open streams without completing runs', async () => {
    const bus = new RunBus();
    bus.publish('r4', 'info', 'x');
    const it = streamRunEvents(bus, 'r4');
    await it.next();
    const pending = it.next();
    bus.endAllStreams();
    expect((await pending).done).toBe(true);
    expect(bus.isComplete('r4')).toBe(false);
  });
});

describe('graceful shutdown (BE-F10)', () => {
  it('app.close() ends open SSE streams on the bus', async () => {
    const bus = new RunBus();
    const app = await buildApp({ config, overrides: { runBus: bus } });
    bus.publish('live', 'info', 'x');
    const it = streamRunEvents(bus, 'live');
    await it.next();
    const pending = it.next();
    await app.close();
    expect((await pending).done).toBe(true);
  });
});

describe('config API_HOST (BE-F3)', () => {
  it('defaults to loopback, overridable via API_HOST', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).host).toBe('127.0.0.1');
    expect(loadConfig({ NODE_ENV: 'test', API_HOST: '' } as NodeJS.ProcessEnv).host).toBe('127.0.0.1');
    expect(loadConfig({ NODE_ENV: 'test', API_HOST: '0.0.0.0' } as NodeJS.ProcessEnv).host).toBe('0.0.0.0');
  });
});

describe('ripgrep argument injection (BE-F17)', () => {
  it('a pattern starting with "-" is searched literally, not parsed as an rg flag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dd-rg-'));
    await writeFile(join(root, 'a.txt'), 'line one\n--files marker\n');
    const index = new RipgrepCodeIndex({ clonePathFor: () => root });
    const matches = await index.grep({ owner: 'o', name: 'r' }, '--files');
    expect(matches).toEqual([{ path: 'a.txt', line: 2, text: '--files marker' }]);
  });
});
