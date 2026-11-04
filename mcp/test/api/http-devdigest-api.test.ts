import { describe, expect, it } from 'vitest';
import { HttpDevDigestApi } from '../../src/api/http-devdigest-api.js';
import {
  ApiError,
  ApiUnreachable,
  PrNotImported,
  RepoNotImported,
  RunRateLimited,
} from '../../src/errors.js';

const BASE = 'http://localhost:3001';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

type Route = () => Response | Error | Promise<Response>;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** Fake fetch answering from a "METHOD /path" -> Response|Error map; records calls. */
function make(routes: Record<string, Route>, timeoutMs?: number) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = `${init?.method ?? 'GET'} ${url.replace(BASE, '')}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected request ${key}`);
    const out = await route();
    if (out instanceof Error) throw out;
    return out;
  }) as typeof fetch;
  // trailing slash on purpose: the adapter normalizes it
  return { api: new HttpDevDigestApi({ baseUrl: `${BASE}/`, fetch: fn, timeoutMs }), calls };
}

describe('HttpDevDigestApi success paths', () => {
  it('listAgents skips a malformed item instead of failing the whole list', async () => {
    const { api } = make({ 'GET /agents': () => json([{ id: 'a1', name: 'Sec' }, { id: null }, 'junk']) });
    expect((await api.listAgents()).map((a) => a.id)).toEqual(['a1']);
  });

  it('startReview never falls back to another agent\'s run', async () => {
    const { api } = make({
      'POST /pulls/p1/review': () =>
        json({ pr_id: 'p1', runs: [{ run_id: 'r1', agent_id: 'x' }, { run_id: 'r2', agent_id: 'y' }] }),
    });
    await expect(api.startReview('p1', 'a1')).rejects.toThrow();
  });

  it('listAgents drops system_prompt and unknown keys, tolerates missing optionals', async () => {
    const { api } = make({
      'GET /agents': () =>
        json([
          { id: 'a1', name: 'Sec', description: 'd', model: 'm', enabled: true, system_prompt: 'SECRET', extra: 1 },
          { id: 'a2', name: 'Bare' },
        ]),
    });
    const agents = await api.listAgents();
    expect(agents).toEqual([
      { id: 'a1', name: 'Sec', description: 'd', model: 'm', enabled: true },
      { id: 'a2', name: 'Bare', description: '', model: '', enabled: false },
    ]);
    expect(JSON.stringify(agents)).not.toContain('SECRET');
  });

  it('findRepo matches full_name case-insensitively', async () => {
    const { api } = make({ 'GET /repos': () => json([{ id: 'r1', full_name: 'Acme/Web', owner: 'Acme' }]) });
    expect(await api.findRepo('acme/WEB')).toEqual({ id: 'r1', fullName: 'Acme/Web' });
  });

  it('findRepo throws RepoNotImported with the imported list', async () => {
    const { api } = make({ 'GET /repos': () => json([{ id: 'r1', full_name: 'a/b' }, { id: 'r2', full_name: 'c/d' }]) });
    const err = await api.findRepo('x/y').catch((e) => e);
    expect(err).toBeInstanceOf(RepoNotImported);
    expect(err.repo).toBe('x/y');
    expect(err.importedRepos).toEqual(['a/b', 'c/d']);
  });

  it('findPull returns the PR; unknown number and null/absent id throw PrNotImported', async () => {
    const { api } = make({
      'GET /repos/r%2F1/pulls': () =>
        json([
          { id: 'p1', number: 7, title: 'T', author: 'x' },
          { id: null, number: 8, title: 'No id' },
          { number: 9, title: 'Absent id' },
        ]),
    });
    const repo = { id: 'r/1', fullName: 'a/b' };
    expect(await api.findPull(repo, 7)).toEqual({ id: 'p1', number: 7, title: 'T' });
    for (const n of [8, 9, 10]) {
      const err = await api.findPull(repo, n).catch((e) => e);
      expect(err).toBeInstanceOf(PrNotImported);
      expect(err.pr).toBe(n);
      expect(err.repo).toBe('a/b');
    }
  });

  it('startReview posts {agentId} and returns the matching run', async () => {
    const { api, calls } = make({
      'POST /pulls/p1/review': () =>
        json({ pr_id: 'p1', runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Sec' }], reviews: [] }),
    });
    expect(await api.startReview('p1', 'a1')).toEqual({ runId: 'run1', agentId: 'a1', agentName: 'Sec' });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ agentId: 'a1' });
  });

  it('startReview without runs is an ApiError', async () => {
    const { api } = make({ 'POST /pulls/p1/review': () => json({ pr_id: 'p1', runs: [] }) });
    await expect(api.startReview('p1', 'a1')).rejects.toBeInstanceOf(ApiError);
  });

  it('listRuns maps nullable fields', async () => {
    const { api } = make({
      'GET /pulls/p1/runs': () =>
        json([
          { run_id: 'r1', agent_id: 'a1', agent_name: 'S', status: 'failed', error: 'boom', cost_usd: 1 },
          { run_id: 'r2' },
        ]),
    });
    expect(await api.listRuns('p1')).toEqual([
      { runId: 'r1', agentId: 'a1', agentName: 'S', status: 'failed', error: 'boom' },
      { runId: 'r2', agentId: null, agentName: null, status: null, error: null },
    ]);
  });

  it('listReviews keeps raw uppercase severity and dismissed_at; tolerates missing fields', async () => {
    const { api } = make({
      'GET /pulls/p1/reviews': () =>
        json([
          {
            id: 'rv1', agent_id: 'a1', run_id: 'run1', kind: 'review', verdict: 'request_changes', score: 40,
            created_at: '2026-01-01', summary: 'ignored',
            findings: [
              { id: 'f1', severity: 'CRITICAL', title: 'T', file: 'a.ts', start_line: 3, rationale: 'R', suggestion: null, confidence: 0.9, dismissed_at: null, category: 'bug' },
              { id: 'f2', severity: 'WARNING', dismissed_at: '2026-01-02' },
            ],
          },
          { id: 'rv2', kind: 'summary' },
        ]),
    });
    const [a, b] = await api.listReviews('p1');
    expect(a!.findings[0]).toEqual({
      id: 'f1', severity: 'CRITICAL', file: 'a.ts', startLine: 3, title: 'T', rationale: 'R',
      suggestion: null, confidence: 0.9, dismissedAt: null,
    });
    expect(a!.findings[1]!.dismissedAt).toBe('2026-01-02');
    expect(a).toMatchObject({ agentId: 'a1', runId: 'run1', verdict: 'request_changes', score: 40, kind: 'review' });
    expect(b).toMatchObject({ agentId: null, runId: null, verdict: null, score: null, kind: 'summary', findings: [] });
  });

  it('listReviews counts malformed findings instead of hiding them', async () => {
    const { api } = make({
      'GET /pulls/p1/reviews': () =>
        json([{ id: 'rv1', kind: 'review', findings: [{ id: 'f1', severity: 'WARNING' }, { id: 'f2' }, 'junk'] }]),
    });
    const [a] = await api.listReviews('p1');
    expect(a!.findings).toHaveLength(1);
    expect(a!.unreadableFindings).toBe(2);
  });

  it('listConventions maps candidates and falls back to the accepted flag', async () => {
    const { api } = make({
      'GET /repos/r1/conventions': () =>
        json({
          last_scan_at: null,
          candidates: [
            { id: 'c1', rule: 'Use X', category: 'style', evidence_path: 'a.ts', evidence_line_start: 3, evidence_line_end: 5, status: 'accepted', evidence_snippet: 'x' },
            { id: 'c2', rule: 'Old', evidence_path: 'b.ts', accepted: true },
          ],
        }),
    });
    expect(await api.listConventions('r1')).toEqual([
      { rule: 'Use X', category: 'style', evidencePath: 'a.ts', evidenceLineStart: 3, evidenceLineEnd: 5, status: 'accepted' },
      { rule: 'Old', category: null, evidencePath: 'b.ts', evidenceLineStart: null, evidenceLineEnd: null, status: 'accepted' },
    ]);
  });
});

describe('HttpDevDigestApi failure classes', () => {
  const start = (res: Route) => make({ 'POST /pulls/p1/review': res }).api.startReview('p1', 'a1');

  it('429 with Retry-After maps to RunRateLimited(seconds)', async () => {
    const err = await start(() => json({ message: 'slow' }, { status: 429, headers: { 'retry-after': '23' } })).catch((e) => e);
    expect(err).toBeInstanceOf(RunRateLimited);
    expect(err.retryAfterSeconds).toBe(23);
  });

  it.each([[null], ['soon'], ['0'], ['Wed, 21 Oct 2026 07:28:00 GMT']])(
    '429 with Retry-After %s falls back to 60',
    async (h) => {
      const headers: Record<string, string> = h === null ? {} : { 'retry-after': h };
      const err = await start(() => json({}, { status: 429, headers })).catch((e) => e);
      expect(err).toBeInstanceOf(RunRateLimited);
      expect(err.retryAfterSeconds).toBe(60);
    },
  );

  it('429 on a read call is an ApiError, not a review rate limit', async () => {
    const { api } = make({ 'GET /agents': () => json({}, { status: 429 }) });
    const err = await api.listAgents().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
  });

  it('404 maps to ApiError with the API message', async () => {
    const err = await start(() => json({ error: { code: 'not_found', message: 'Agent not found' } }, { status: 404 })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, operation: 'POST /pulls/:id/review', detail: 'Agent not found' });
  });

  it('422 maps to ApiError', async () => {
    const err = await start(() => json({ error: { code: 'validation_error', message: 'Request validation failed' } }, { status: 422 })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
  });

  it('5xx maps to ApiError; long and non-JSON messages are truncated', async () => {
    const a = await start(() => json({ error: { message: 'x'.repeat(5000) } }, { status: 500 })).catch((e) => e);
    expect(a).toBeInstanceOf(ApiError);
    expect(a.detail.length).toBeLessThanOrEqual(200);
    const b = await start(() => new Response('<html>boom</html>', { status: 502, statusText: 'Bad Gateway' })).catch((e) => e);
    expect(b).toBeInstanceOf(ApiError);
    expect(b.detail).toBe('Bad Gateway');
  });

  it('connection refused maps to ApiUnreachable with the normalized base URL', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const err = await make({ 'GET /agents': () => refused }).api.listAgents().catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnreachable);
    expect(err.base).toBe(BASE);
  });

  it('timeout (AbortSignal) maps to ApiUnreachable', async () => {
    const hang = (async (_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init!.signal!.addEventListener('abort', () => rej(init!.signal!.reason));
      })) as typeof fetch;
    const api = new HttpDevDigestApi({ baseUrl: BASE, fetch: hang, timeoutMs: 20 });
    await expect(api.listAgents()).rejects.toBeInstanceOf(ApiUnreachable);
  });

  it('never follows redirects: every request (GET and POST) sets redirect:"error"', async () => {
    const { api, calls } = make({
      'GET /agents': () => json([]),
      'POST /pulls/p1/review': () => json({ runs: [{ run_id: 'r1', agent_id: 'a1' }] }),
    });
    await api.listAgents();
    await api.startReview('p1', 'a1');
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c.init?.redirect).toBe('error');
  });

  it('a refused redirect (fetch rejects) is ApiUnreachable and shows only the origin', async () => {
    const redirected = (async () => {
      throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
    }) as typeof fetch;
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001/prefix', fetch: redirected });
    const err = await api.listAgents().catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnreachable);
    expect(err.base).toBe('http://localhost:3001');
  });

  it('a 3xx response that reaches the adapter is an ApiError, never parsed or followed', async () => {
    const { api } = make({
      'GET /agents': () => new Response(null, { status: 302, headers: { location: 'http://evil.example/' } }),
    });
    const err = await api.listAgents().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(302);
  });

  it('attaches an AbortSignal to every request', async () => {
    const { api, calls } = make({ 'GET /agents': () => json([]) });
    await api.listAgents();
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('unparsable JSON and wrong shape are ApiError', async () => {
    const a = await make({ 'GET /agents': () => new Response('not json') }).api.listAgents().catch((e) => e);
    expect(a).toBeInstanceOf(ApiError);
    const b = await make({ 'GET /agents': () => json({ not: 'an array' }) }).api.listAgents().catch((e) => e);
    expect(b).toBeInstanceOf(ApiError);
  });

  it('path ids are URL-encoded', async () => {
    const { api, calls } = make({ 'GET /pulls/a%2Fb%3Fc/runs': () => json([]) });
    await api.listRuns('a/b?c');
    expect(calls[0]!.url).toBe(`${BASE}/pulls/a%2Fb%3Fc/runs`);
  });
});
