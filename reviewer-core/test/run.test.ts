import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest, DEFAULT_REVIEW_MAX_TOKENS } from '../src/index.js';
import type { StructuredRequest } from '@devdigest/shared';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('onUsage reports running totals per chunk; a later failure keeps the partial usage', async () => {
    let calls = 0;
    const flaky: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        calls += 1;
        if (calls === 2) throw new Error('429 quota');
        return { data: fixture as unknown as T, model: req.model, tokensIn: 1000, tokensOut: 200, costUsd: 0.0013, raw: '', attempts: 1 };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const twoFiles =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n x\n+y\n' +
      'diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1,1 +1,2 @@\n x\n+z\n';
    const diff = await new MockGitClient({ diff: twoFiles }).diff();

    const usage: { tokensIn: number; tokensOut: number; costUsd: number | null }[] = [];
    await expect(
      reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: flaky, strategy: 'map-reduce', onUsage: (u) => usage.push(u) }),
    ).rejects.toThrow('429 quota');

    expect(usage).toEqual([{ tokensIn: 1000, tokensOut: 200, costUsd: 0.0013 }]);
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

describe('reviewPullRequest — map-reduce + output cap', () => {
  const approve = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
  const threeFiles =
    'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,2 @@\n x\n+FOO_TS\n' +
    'diff --git a/foo.tsx b/foo.tsx\n--- a/foo.tsx\n+++ b/foo.tsx\n@@ -1,1 +1,2 @@\n x\n+FOO_TSX\n' +
    'diff --git a/sub/foo.ts b/sub/foo.ts\n--- a/sub/foo.ts\n+++ b/sub/foo.ts\n@@ -1,1 +1,2 @@\n x\n+SUB_FOO\n';
  const structuredReqs = (llm: MockLLMProvider) =>
    llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => c.req as StructuredRequest<unknown>);
  const userMsg = (r: StructuredRequest<unknown>) => r.messages.find((m) => m.role === 'user')!.content;

  it('one chunk per file; each chunk prompt carries only its own file slice', async () => {
    const llm = new MockLLMProvider('openai', { structured: approve });
    const diff = await new MockGitClient({ diff: threeFiles }).diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, strategy: 'map-reduce' });

    expect(outcome.mode).toBe('map-reduce');
    expect(outcome.chunks.map((c) => c.label)).toEqual(['foo.ts', 'foo.tsx', 'sub/foo.ts']);
    const users = structuredReqs(llm).map(userMsg);
    expect(users).toHaveLength(3);
    expect(users[0]).toContain('+FOO_TS\n');
    expect(users[0]).not.toContain('FOO_TSX');
    expect(users[0]).not.toContain('SUB_FOO');
    expect(users[1]).toContain('FOO_TSX');
    expect(users[1]).not.toContain('SUB_FOO');
    expect(users[2]).toContain('SUB_FOO');
    expect(users[2]).not.toContain('FOO_TSX');
  });

  it(`sends maxTokens=${DEFAULT_REVIEW_MAX_TOKENS} by default on every call`, async () => {
    const llm = new MockLLMProvider('openai', { structured: approve });
    const diff = await new MockGitClient({ diff: threeFiles }).diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, strategy: 'map-reduce' });
    const reqs = structuredReqs(llm);
    expect(reqs).toHaveLength(3);
    expect(reqs.every((r) => r.maxTokens === DEFAULT_REVIEW_MAX_TOKENS)).toBe(true);
  });

  it('honours a maxTokens override', async () => {
    const llm = new MockLLMProvider('openai', { structured: approve });
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, maxTokens: 2048 });
    expect(structuredReqs(llm).map((r) => r.maxTokens)).toEqual([2048]);
  });

  it('an LLM secret_leak finding outside every hunk is dropped (no kind exemption for LLM output)', async () => {
    const leak = {
      ...approve,
      findings: [
        {
          id: 'leak',
          severity: 'CRITICAL',
          category: 'security',
          title: 'secret',
          file: 'src/config.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'r',
          confidence: 0.9,
          kind: 'secret_leak',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: leak });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm });
    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.dropped[0]!.reason).toMatch(/do not intersect/);
  });
});
