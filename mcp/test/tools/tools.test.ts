import type { CallToolResult } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AgentNotFound,
  ApiError,
  ApiUnreachable,
  MAX_LISTED_VALUES,
  PrNotImported,
  RepoNotImported,
  RunNotFound,
  RunRateLimited,
} from '../use-cases/imports.js';
import { bigFindings, finding, review } from '../fixtures/reviews.js';
import { agent, FakeApi, FakeClock, run } from '../use-cases/fakes.js';
import { createDeps } from '../../src/use-cases/index.js';
import {
  GET_BLAST_RADIUS,
  GET_CONVENTIONS,
  GET_FINDINGS,
  LIST_AGENTS,
  RUN_AGENT_ON_PR,
  TOOL_NAMES,
  registerTools,
} from '../../src/tools/index.js';
import { GENERIC_ERROR_TEXT, toToolError } from '../../src/tools/to-tool-error.js';
import { getBlastRadiusHandler } from '../../src/tools/get-blast-radius.js';
import { getConventionsHandler } from '../../src/tools/get-conventions.js';
import { getFindingsHandler } from '../../src/tools/get-findings.js';
import { listAgentsHandler } from '../../src/tools/list-agents.js';
import { runAgentOnPrHandler } from '../../src/tools/run-agent-on-pr.js';
import { MAX_RESPONSE_CHARS, TEXT_CAPS } from '../../src/constants.js';

function setup() {
  const api = new FakeApi();
  const deps = createDeps({ api, clock: new FakeClock() });
  return { api, deps };
}

const runArgs = { repo: 'acme/shop', pr: 12, agent: 'a1' };

function text(res: CallToolResult): string {
  const block = res.content[0];
  return block && block.type === 'text' ? block.text : '';
}

function expectSuccess(res: CallToolResult, schema: z.ZodType) {
  expect(res.isError).toBeUndefined();
  expect(res.content).toHaveLength(1);
  expect(res.structuredContent).toBeDefined();
  expect(JSON.parse(text(res))).toEqual(res.structuredContent);
  const parsed = schema.safeParse(res.structuredContent);
  expect(parsed.error?.issues).toBeUndefined();
}

function expectError(res: CallToolResult, expected: string) {
  expect(res.isError).toBe(true);
  expect(res.structuredContent).toBeUndefined();
  expect(res.content).toEqual([{ type: 'text', text: expected }]);
}

afterEach(() => vi.restoreAllMocks());

describe('success results carry structuredContent and the identical text block', () => {
  it('list_agents', async () => {
    const { deps } = setup();
    const res = await listAgentsHandler(deps)();
    expectSuccess(res, LIST_AGENTS.config.outputSchema);
    expect(res.structuredContent).toEqual({
      agents: [{ id: 'a1', name: 'security-reviewer', description: 'd', model: 'm', enabled: true }],
    });
  });

  it('run_agent_on_pr: done, running and failed', async () => {
    const done = setup();
    done.api.reviews = [review([finding()])];
    const res = await runAgentOnPrHandler(done.deps)(runArgs);
    expectSuccess(res, RUN_AGENT_ON_PR.config.outputSchema);
    expect(res.structuredContent).toMatchObject({ status: 'done', run_id: 'run-1' });

    const running = setup();
    running.api.runsByPoll = [[run()]];
    const r2 = await runAgentOnPrHandler(running.deps)(runArgs);
    expectSuccess(r2, RUN_AGENT_ON_PR.config.outputSchema);
    expect(r2.structuredContent).toMatchObject({ status: 'running', run_id: 'run-1' });

    const failed = setup();
    failed.api.runsByPoll = [[run({ status: 'failed', error: 'boom' })]];
    const r3 = await runAgentOnPrHandler(failed.deps)(runArgs);
    expectSuccess(r3, RUN_AGENT_ON_PR.config.outputSchema);
    expect(r3.isError).toBeUndefined();
    expect(r3.structuredContent).toEqual({ status: 'failed', run_id: 'run-1', error: 'boom' });
  });

  it('run_agent_on_pr: a done run without a review is a non-error failed result', async () => {
    const { deps } = setup();
    const res = await runAgentOnPrHandler(deps)(runArgs);
    expectSuccess(res, RUN_AGENT_ON_PR.config.outputSchema);
    expect(res.structuredContent).toEqual({
      status: 'failed',
      run_id: 'run-1',
      error: 'Run finished but produced no review.',
    });
  });

  it('run_agent_on_pr: 500 findings stay within the response cap', async () => {
    const { api, deps } = setup();
    api.reviews = [review(bigFindings(500))];
    const res = await runAgentOnPrHandler(deps)({ ...runArgs, detail: 'full', limit: 100 });
    expectSuccess(res, RUN_AGENT_ON_PR.config.outputSchema);
    expect(text(res).length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(res.structuredContent).toMatchObject({ truncated: true, total: 500 });
  });

  it('get_findings: with run_id, default (all agents) and no review yet', async () => {
    const { api, deps } = setup();
    const handler = getFindingsHandler(deps);
    const empty = await handler({ repo: 'acme/shop', pr: 12 });
    expectSuccess(empty, GET_FINDINGS.config.outputSchema);
    expect(empty.structuredContent).toMatchObject({ status: 'done', pr: 12, reviews: [] });

    api.reviews = [review([finding()])];
    const byRun = await handler({ repo: 'acme/shop', pr: 12, run_id: 'run-1' });
    expectSuccess(byRun, GET_FINDINGS.config.outputSchema);
    expect(byRun.structuredContent).toMatchObject({ status: 'done', run_id: 'run-1' });

    const all = await handler({ repo: 'acme/shop', pr: 12 });
    expectSuccess(all, GET_FINDINGS.config.outputSchema);
    expect(all.structuredContent).toMatchObject({ status: 'done', pr: 12 });
    expect(api.count('startReview')).toBe(0);
  });

  it('get_findings: finished run without a review is a non-error failed result', async () => {
    const { deps } = setup();
    const res = await getFindingsHandler(deps)({ repo: 'acme/shop', pr: 12, run_id: 'run-1' });
    expectSuccess(res, GET_FINDINGS.config.outputSchema);
    expect(res.structuredContent).toEqual({
      status: 'failed',
      run_id: 'run-1',
      error: 'Run finished but produced no review.',
    });
  });

  it('get_conventions', async () => {
    const { api, deps } = setup();
    api.conventions = [{ rule: 'Use X', category: 'style', evidencePath: 'a.ts', evidenceLineStart: 3, status: 'accepted' }];
    const res = await getConventionsHandler(deps)({ repo: 'acme/shop' });
    expectSuccess(res, GET_CONVENTIONS.config.outputSchema);
    expect(res.structuredContent).toMatchObject({ total: 1, conventions: [{ evidence: 'a.ts:3' }] });
  });

  it('get_blast_radius', async () => {
    const { deps } = setup();
    const res = await getBlastRadiusHandler(deps)({ repo: 'acme/shop', pr: 12 });
    expectSuccess(res, GET_BLAST_RADIUS.config.outputSchema);
    expect(res.structuredContent).toMatchObject({
      pr: 12,
      counts: { callers: 1 },
      downstream: [{ symbol: 'rateLimit' }],
    });
  });

  it('get_blast_radius: unknown PR gives the PrNotImported text with isError', async () => {
    const { deps } = setup();
    const res = await getBlastRadiusHandler(deps)({ repo: 'acme/shop', pr: 99 });
    expectError(
      res,
      'PR #99 is not imported for Acme/Shop. Open the repo in the DevDigest studio and refresh pull requests, then retry.',
    );
  });
});

describe('semantic errors: exact text and isError:true, through the handlers', () => {
  it('AgentNotFound', async () => {
    const { api, deps } = setup();
    api.agents = [agent(), agent({ id: 'a2', name: 'perf' })];
    expectError(
      await runAgentOnPrHandler(deps)({ ...runArgs, agent: 'zz' }),
      'Agent "zz" not found. Valid agents: security-reviewer (id a1), perf (id a2). Call list_agents to see them.',
    );
    expectError(
      await getFindingsHandler(deps)({ repo: 'acme/shop', pr: 12, agent: 'zz' }),
      'Agent "zz" not found. Valid agents: security-reviewer (id a1), perf (id a2). Call list_agents to see them.',
    );
  });

  it('AgentNotFound with a cut list ends with ", …"', async () => {
    const { api, deps } = setup();
    api.agents = Array.from({ length: 15 }, (_, i) => agent({ id: `a${i}`, name: `n${i}` }));
    const res = await runAgentOnPrHandler(deps)({ ...runArgs, agent: 'zz' });
    const expectedList = Array.from({ length: MAX_LISTED_VALUES }, (_, i) => `n${i} (id a${i})`).join(', ');
    expectError(res, `Agent "zz" not found. Valid agents: ${expectedList}, … Call list_agents to see them.`);
  });

  it('RepoNotImported (all repo tools)', async () => {
    const { deps } = setup();
    const expected =
      'Repo "x/y" is not imported in DevDigest. Imported repos: Acme/Shop. Import it in the studio first.';
    expectError(await runAgentOnPrHandler(deps)({ ...runArgs, repo: 'x/y' }), expected);
    expectError(await getFindingsHandler(deps)({ repo: 'x/y', pr: 12 }), expected);
    expectError(await getConventionsHandler(deps)({ repo: 'x/y' }), expected);
  });

  it('RepoNotImported with a cut list ends with ", …"', () => {
    const repos = Array.from({ length: 12 }, (_, i) => `o/r${i}`);
    expectError(
      toToolError(new RepoNotImported('x/y', repos)),
      `Repo "x/y" is not imported in DevDigest. Imported repos: ${repos.slice(0, 10).join(', ')}, … Import it in the studio first.`,
    );
  });

  it('PrNotImported', async () => {
    const { deps } = setup();
    const expected =
      'PR #99 is not imported for Acme/Shop. Open the repo in the DevDigest studio and refresh pull requests, then retry.';
    expectError(await runAgentOnPrHandler(deps)({ ...runArgs, pr: 99 }), expected);
    expectError(await getFindingsHandler(deps)({ repo: 'acme/shop', pr: 99 }), expected);
  });

  it('RunRateLimited', async () => {
    const { api, deps } = setup();
    api.startReview = async () => {
      throw new RunRateLimited(30);
    };
    expectError(
      await runAgentOnPrHandler(deps)(runArgs),
      'Review rate limit reached (10/min). Wait ~30s and call run_agent_on_pr again, or use get_findings for an existing run.',
    );
  });

  it('ApiUnreachable', async () => {
    const { api, deps } = setup();
    api.listAgents = async () => {
      throw new ApiUnreachable('http://localhost:3001');
    };
    expectError(
      await listAgentsHandler(deps)(),
      'DevDigest API is not reachable at http://localhost:3001. Start it with ./scripts/dev.sh, then retry.',
    );
  });

  it('ApiUnreachable shows only the origin of the base (no credentials, path, query)', () => {
    expectError(
      toToolError(new ApiUnreachable('https://user:pw@example.com:8443/api/v1?token=abc#frag')),
      'DevDigest API is not reachable at https://example.com:8443. Start it with ./scripts/dev.sh, then retry.',
    );
    expect(text(toToolError(new ApiUnreachable('not a url')))).toContain('<invalid url>');
  });

  it('AgentNotFound truncates agent names to the cap', () => {
    const longName = 'n'.repeat(500);
    const res = toToolError(new AgentNotFound('zz', [{ id: 'a1', name: longName }], 1));
    expect(text(res)).toBe(
      `Agent "zz" not found. Valid agents: ${'n'.repeat(TEXT_CAPS.agentName - 1)}… (id a1). Call list_agents to see them.`,
    );
  });

  it('RunNotFound', async () => {
    const { deps } = setup();
    expectError(
      await getFindingsHandler(deps)({ repo: 'acme/shop', pr: 12, run_id: 'nope' }),
      'Run "nope" not found for PR #12 of Acme/Shop. It may be from another PR or expired. Call run_agent_on_pr(repo, pr, agent) to start a new one.',
    );
  });

  it('ApiError (message truncated)', async () => {
    const { api, deps } = setup();
    api.listConventions = async () => {
      throw new ApiError(500, 'listConventions', 'oops');
    };
    expectError(
      await getConventionsHandler(deps)({ repo: 'acme/shop' }),
      'DevDigest API returned 500 for listConventions: oops. Check the API logs, then retry.',
    );
    const long = toToolError(new ApiError(502, 'op', 'x'.repeat(5_000)));
    expect(text(long).length).toBeLessThan(400);
  });

  it('each catalog text names the next call', () => {
    const errors = [
      new AgentNotFound('x', [{ id: 'a', name: 'A' }], 1),
      new RepoNotImported('o/n', ['o/m']),
      new PrNotImported('o/n', 3),
      new RunRateLimited(60),
      new ApiUnreachable('http://localhost:3001'),
      new RunNotFound('r', 'o/n', 3),
      new ApiError(500, 'op', 'm'),
    ];
    for (const e of errors) expect(text(toToolError(e))).toMatch(/call|Call|Start|Import|Open|Check/);
  });
});

describe('unknown errors', () => {
  it('give a generic safe message: no stack, no raw body', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, deps } = setup();
    api.listAgents = async () => {
      throw new Error('secret-body {"token":"abc"} at /Users/x/file.ts:1');
    };
    const res = await listAgentsHandler(deps)();
    expectError(res, GENERIC_ERROR_TEXT);
    expect(JSON.stringify(res)).not.toContain('secret-body');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-body');
  });

  it('non-Error throwables are handled too', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expectError(toToolError('boom'), GENERIC_ERROR_TEXT);
  });
});

describe('definitions', () => {
  const tools = [LIST_AGENTS, RUN_AGENT_ON_PR, GET_FINDINGS, GET_CONVENTIONS, GET_BLAST_RADIUS];

  it('descriptions are the frozen texts and within budget', () => {
    expect(LIST_AGENTS.config.description).toBe(
      'List the configured DevDigest review agents (id, name, description, model, enabled). Call this first to get a valid agent id for run_agent_on_pr.',
    );
    expect(RUN_AGENT_ON_PR.config.description).toBe(
      'Run one review agent on a pull request and return verdict, score, severity counts and findings. Waits up to ~100 s; if still running it returns run_id, then call get_findings. Starts an LLM run (costs tokens, max 10/min). Needs repo (owner/name), pr, and an agent id from list_agents.',
    );
    expect(GET_FINDINGS.config.description).toBe(
      'Get verdict, score and findings of an already finished review run on a pull request (latest run of each agent by default, or one run_id). Never starts a run. detail=full adds rationale and suggestion.',
    );
    expect(GET_CONVENTIONS.config.description).toBe(
      "Get a repository's accepted coding conventions (rule, category, evidence path:line) to check code against. Empty until conventions are accepted in the DevDigest studio.",
    );
    expect(GET_BLAST_RADIUS.config.description).toBe(
      "Map the blast radius of a pull request: symbols declared in its changed files, who calls them (file:line), and HTTP endpoints and cron jobs that may depend on them. Reads DevDigest's prebuilt code index, no LLM. Call before reviewing or merging a risky change. Needs repo (owner/name) and pr.",
    );
    for (const t of tools) {
      expect(t.config.description.length, t.name).toBeLessThanOrEqual(300);
    }
  });

  it('every parameter has a short description with an example; unknown keys are rejected', () => {
    for (const t of tools) {
      const json = z.toJSONSchema(t.config.inputSchema) as { properties: Record<string, { description?: string }> };
      for (const [key, prop] of Object.entries(json.properties)) {
        if (key === 'repo') expect(prop.description).toBe('owner/name');
        else expect(prop.description, `${t.name}.${key}`).toMatch(/e\.g\.|UUID|returned by/);
        expect(prop.description?.length ?? 0, `${t.name}.${key}`).toBeLessThanOrEqual(80);
      }
      expect(t.config.inputSchema.safeParse({ repo: 'a/b', pr: 1, agent: 'x', extra: 1 }).success).toBe(false);
    }
  });

  it('annotations match the spec and no alwaysLoad is set', () => {
    // list_agents touches nothing outside the DevDigest API: closed world.
    expect(LIST_AGENTS.config.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    // These resolve repo + PR, and the API's GET /repos/:id/pulls may sync from GitHub.
    for (const t of [GET_FINDINGS, GET_CONVENTIONS, GET_BLAST_RADIUS]) {
      expect(t.config.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, openWorldHint: true });
    }
    expect(RUN_AGENT_ON_PR.config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    for (const t of tools) expect(JSON.stringify(t.config)).not.toContain('alwaysLoad');
  });

  it('every outputSchema has an object root (no result-wrapping by the SDK)', () => {
    for (const t of tools) {
      expect((z.toJSONSchema(t.config.outputSchema) as { type?: string }).type).toBe('object');
    }
  });

  it('input validation: repo regex, pr, limit, id length caps', () => {
    const schema = RUN_AGENT_ON_PR.config.inputSchema;
    const good = { repo: 'Acme/shop.v2_x-y', pr: 1, agent: 'a'.repeat(128), limit: 100, detail: 'full' };
    expect(schema.safeParse(good).success).toBe(true);
    for (const bad of [
      { ...good, repo: 'no-slash' },
      { ...good, repo: 'a/b/c' },
      { ...good, repo: '../etc/passwd' },
      { ...good, repo: 'a/b c' },
      { ...good, pr: 0 },
      { ...good, pr: 1.5 },
      { ...good, agent: 'a'.repeat(129) },
      { ...good, agent: '' },
      { ...good, limit: 101 },
      { ...good, limit: 0 },
      { ...good, detail: 'verbose' },
    ]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
    expect(GET_FINDINGS.config.inputSchema.safeParse({ repo: 'a/b', pr: 1, run_id: 'r'.repeat(129) }).success).toBe(false);
  });
});

describe('registerTools', () => {
  it('registers the five tools in the fixed order with their config', () => {
    const registered: { name: string; config: unknown }[] = [];
    const server = { registerTool: (name: string, config: unknown) => registered.push({ name, config }) };
    registerTools(server as never, setup().deps);
    expect(registered.map((r) => r.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);
    expect([...TOOL_NAMES]).toEqual(registered.map((r) => r.name));
    expect(registered[1]!.config).toBe(RUN_AGENT_ON_PR.config);
  });
});
