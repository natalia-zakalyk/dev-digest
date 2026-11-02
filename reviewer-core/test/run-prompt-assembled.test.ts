/**
 * reviewPullRequest — `onPromptAssembled` / `measure` (prompt-assembly log hooks).
 * Stubbed LLM, no I/O.
 */
import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockGitClient } from '../../server/src/adapters/mocks.js';
import { assemblePrompt, reviewPullRequest, type PromptAssembledEvent } from '../src/index.js';

const approve = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const threeFiles =
  'diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,2 @@\n x\n+FOO_TS\n' +
  'diff --git a/bar.ts b/bar.ts\n--- a/bar.ts\n+++ b/bar.ts\n@@ -1,1 +1,2 @@\n x\n+BAR_TS\n' +
  'diff --git a/baz.ts b/baz.ts\n--- a/baz.ts\n+++ b/baz.ts\n@@ -1,1 +1,2 @@\n x\n+BAZ_TS\n';

/** LLM stub recording call order into `order`; optionally throws on the n-th call (1-based). */
function stubLlm(order: string[], failOn?: number): LLMProvider {
  let n = 0;
  return {
    id: 'openrouter',
    async completeStructured<T>(req): Promise<StructuredResult<T>> {
      n += 1;
      order.push(`llm#${n}`);
      if (n === failOn) throw new Error('provider failed');
      return { data: approve as unknown as T, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
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
}

const SECRET = 'SENTINEL_SYSTEM_PROMPT_5b8c';
const base = { systemPrompt: SECRET, model: 'm', prDescription: 'SENTINEL_PR_BODY_c91e', skills: ['SENTINEL_SKILL_BODY_aa12'] };

describe('reviewPullRequest — onPromptAssembled', () => {
  it('single-pass: fires once, before the LLM call, with chunk 0 of 1 and "all files"', async () => {
    const order: string[] = [];
    const events: PromptAssembledEvent[] = [];
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({
      ...base, diff, llm: stubLlm(order), strategy: 'single-pass',
      onPromptAssembled: (e) => {
        order.push('assembled');
        events.push(e);
      },
    });
    expect(order).toEqual(['assembled', 'llm#1']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ chunkIndex: 0, chunkCount: 1, label: 'all files', mode: 'single-pass' });
    expect(events[0]!.sections.map((s) => s.name)).toEqual(['system', 'pr_description', 'skills', 'diff']);
  });

  it('map-reduce: fires once per chunk, each BEFORE its own LLM call, with index/count/label', async () => {
    const order: string[] = [];
    const events: PromptAssembledEvent[] = [];
    const diff = await new MockGitClient({ diff: threeFiles }).diff();
    await reviewPullRequest({
      ...base, diff, llm: stubLlm(order), strategy: 'map-reduce',
      onPromptAssembled: (e) => {
        order.push(`assembled${e.chunkIndex}`);
        events.push(e);
      },
    });
    expect(order).toEqual(['assembled0', 'llm#1', 'assembled1', 'llm#2', 'assembled2', 'llm#3']);
    expect(events.map((e) => [e.chunkIndex, e.chunkCount, e.label, e.mode])).toEqual([
      [0, 3, 'foo.ts', 'map-reduce'],
      [1, 3, 'bar.ts', 'map-reduce'],
      [2, 3, 'baz.ts', 'map-reduce'],
    ]);
  });

  it('still fires for the chunk whose LLM call then throws', async () => {
    const order: string[] = [];
    let fired = 0;
    const diff = await new MockGitClient({ diff: threeFiles }).diff();
    await expect(
      reviewPullRequest({ ...base, diff, llm: stubLlm(order, 2), strategy: 'map-reduce', onPromptAssembled: () => void (fired += 1) }),
    ).rejects.toThrow('provider failed');
    expect(fired).toBe(2);
  });

  it('is not required: runs fine without the hook or measure', async () => {
    const diff = await new MockGitClient().diff();
    await expect(reviewPullRequest({ ...base, diff, llm: stubLlm([]) })).resolves.toMatchObject({ mode: 'single-pass' });
  });

  it('payload carries sizes only: no prompt text, in either mode', async () => {
    for (const strategy of ['single-pass', 'map-reduce'] as const) {
      const events: PromptAssembledEvent[] = [];
      const diff = await new MockGitClient({ diff: threeFiles }).diff();
      await reviewPullRequest({
        ...base, diff, llm: stubLlm([]), strategy, measure: (t) => ({ tokens: t.length, hash: 'abcdef012345' }),
        onPromptAssembled: (e) => events.push(e),
      });
      const json = JSON.stringify(events);
      for (const s of ['SENTINEL', 'FOO_TS', 'BAR_TS', 'BAZ_TS']) expect(json).not.toContain(s);
      expect(events.every((e) => e.sections.every((s) => typeof s.tokens === 'number'))).toBe(true);
    }
  });

  it('chunk sections reflect the chunk diff only (map-reduce diff section is per file)', async () => {
    const events: PromptAssembledEvent[] = [];
    const diff = await new MockGitClient({ diff: threeFiles }).diff();
    await reviewPullRequest({ ...base, diff, llm: stubLlm([]), strategy: 'map-reduce', onPromptAssembled: (e) => events.push(e) });
    const diffChars = events.map((e) => e.sections.find((s) => s.name === 'diff')!.chars);
    const whole = assemblePrompt({ system: 's', diff: diff.raw }).sections.find((s) => s.name === 'diff')!.chars;
    expect(diffChars.every((c) => c < whole)).toBe(true);
  });
});

describe('reviewPullRequest — measure', () => {
  it('is used only for per-chunk assemblies, never for the whole-diff trace assembly', async () => {
    const diff = await new MockGitClient({ diff: threeFiles }).diff();
    const measured: string[] = [];
    const out = await reviewPullRequest({
      ...base, diff, llm: stubLlm([]), strategy: 'map-reduce',
      measure: (t) => (measured.push(t), { tokens: 1 }),
    });
    // Exactly 3 chunk assemblies' worth of calls (no extra pass for the whole diff).
    const perAssembly = (() => {
      let n = 0;
      assemblePrompt({ system: SECRET, prDescription: base.prDescription, skills: base.skills, diff: 'x' }, { measure: () => (n++, { tokens: 1 }) });
      return n;
    })();
    expect(measured).toHaveLength(3 * perAssembly);
    // No measured text holds more than one file's diff.
    expect(measured.some((t) => t.includes('FOO_TS') && t.includes('BAR_TS'))).toBe(false);
    expect(out.chunks).toHaveLength(3);
  });

  it('outcome (messages sent, assembly, review) is identical with and without measure/hook', async () => {
    const run = async (extra: object) => {
      const llm = stubLlm([]);
      const sent: unknown[] = [];
      const wrapped: LLMProvider = { ...llm, completeStructured: (req) => (sent.push(req.messages), llm.completeStructured(req)) };
      const diff = await new MockGitClient({ diff: threeFiles }).diff();
      const outcome = await reviewPullRequest({ ...base, diff, llm: wrapped, strategy: 'map-reduce', ...extra });
      return { sent, outcome };
    };
    const plain = await run({});
    const withHooks = await run({ measure: () => ({ tokens: 3, hash: 'abcdef012345' }), onPromptAssembled: () => undefined });
    expect(withHooks.sent).toEqual(plain.sent);
    expect(withHooks.outcome.assembly).toEqual(plain.outcome.assembly);
    expect(withHooks.outcome.review).toEqual(plain.outcome.review);
  });
});
