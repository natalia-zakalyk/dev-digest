/**
 * assemblePrompt — per-section metadata (`sections`) for the prompt-assembly log.
 * Pins order, sizes, truncation flags, items, that metadata never carries text, and that
 * measuring does not change what is sent to the model.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ReviewIntent } from '@devdigest/shared';
import { assemblePrompt, MAX_INTENT_CHARS, type PromptParts } from '../src/prompt.js';

const SENT = {
  system: 'SENTINEL_SYSTEM_PROMPT_5b8c',
  task: 'SENTINEL_TASK_1a2b',
  body: 'SENTINEL_PR_BODY_c91e',
  skill: 'SENTINEL_SKILL_BODY_aa12',
  memory: 'SENTINEL_MEMORY_9d3e',
  spec: 'SENTINEL_SPEC_BODY_44d0',
  repoMap: 'SENTINEL_REPO_MAP_7e21',
  callers: 'SENTINEL_CALLERS_0f66',
  diff: 'SENTINEL_DIFF_7f3a',
  intent: 'SENTINEL_INTENT_text_b1c4',
} as const;

const intent: ReviewIntent = {
  intent: SENT.intent,
  in_scope: ['api'],
  out_of_scope: [],
  risk_areas: ['auth'],
  confidence: 'high',
  basis: 'documented',
};

const FULL: PromptParts = {
  system: SENT.system,
  task: SENT.task,
  prDescription: SENT.body,
  intent,
  skills: [SENT.skill, `${SENT.skill}-2`],
  memory: [SENT.memory],
  specs: [SENT.spec],
  repoMap: SENT.repoMap,
  callers: SENT.callers,
  diff: SENT.diff,
};

const measure = (t: string) => ({ tokens: Math.ceil(t.length / 4), hash: 'abcdef012345' });

describe('assemblePrompt sections', () => {
  it('lists present sections in prompt order, with static source/trust/wrapped facts', () => {
    const { sections } = assemblePrompt(FULL);
    expect(sections.map((s) => s.name)).toEqual([
      'system', 'task', 'pr_description', 'pr_intent', 'skills', 'memory', 'repo_map', 'specs', 'callers', 'diff',
    ]);
    const by = Object.fromEntries(sections.map((s) => [s.name, s]));
    expect(by.system).toMatchObject({ source: 'agent_config', trust: 'trusted', wrapped: false });
    expect(by.pr_description).toMatchObject({ source: 'pr_author', trust: 'untrusted', wrapped: true });
    expect(by.skills).toMatchObject({ source: 'skills_db', trust: 'trusted', wrapped: false });
    expect(by.diff).toMatchObject({ source: 'git_diff', trust: 'untrusted', wrapped: true });
  });

  it('omits sections that are absent from the prompt', () => {
    const { sections } = assemblePrompt({ system: 's', diff: 'd' });
    expect(sections.map((s) => s.name)).toEqual(['system', 'diff']);
    const { sections: s2 } = assemblePrompt({ system: 's', diff: 'd', prDescription: '   ', skills: [], memory: [], specs: [], repoMap: ' ', callers: '' });
    expect(s2.map((s) => s.name)).toEqual(['system', 'diff']);
  });

  it('chars equal the rendered lengths: they add up to the messages that are sent', () => {
    const { sections, messages } = assemblePrompt(FULL);
    const system = sections.find((s) => s.name === 'system')!;
    expect(system.chars).toBe(messages[0]!.content.length);
    const userSections = sections.filter((s) => s.name !== 'system');
    const joined = userSections.reduce((n, s) => n + s.chars, 0) + 2 * (userSections.length - 1);
    expect(joined).toBe(messages[1]!.content.length);
  });

  it('flags a PR description over the 4000-char cap as truncated, and only then', () => {
    const t = (n: number) => assemblePrompt({ system: 's', diff: 'd', prDescription: 'x'.repeat(n) }).sections.find((s) => s.name === 'pr_description')!;
    expect(t(4000).truncated).toBe(false);
    expect(t(4001).truncated).toBe(true);
    const big = t(5000);
    expect(big.truncated).toBe(true);
    // The rendered section holds the capped text (4000) plus the wrapper, not 5000.
    expect(big.chars).toBeLessThan(4200);
  });

  it('flags an over-long intent as truncated', () => {
    const long: ReviewIntent = { ...intent, intent: 'i'.repeat(MAX_INTENT_CHARS + 50) };
    const sec = (i: ReviewIntent) => assemblePrompt({ system: 's', diff: 'd', intent: i }).sections.find((s) => s.name === 'pr_intent')!;
    expect(sec(long).truncated).toBe(true);
    expect(sec(intent).truncated).toBe(false);
    expect(assemblePrompt({ system: 's', diff: 'd', intent: { ...intent, intent: '  ' } }).sections.map((s) => s.name)).toEqual(['system', 'diff']);
  });

  it('multi-item sections report item counts and per-item sizes; scalar sections report 1', () => {
    const { sections } = assemblePrompt({ ...FULL, skills: ['aa', 'bbbb'] }, { measure });
    const skills = sections.find((s) => s.name === 'skills')!;
    expect(skills.items).toBe(2);
    expect(skills.itemsMeta).toEqual([
      { index: 0, chars: 2, tokens: 1, hash: 'abcdef012345' },
      { index: 1, chars: 4, tokens: 1, hash: 'abcdef012345' },
    ]);
    expect(sections.find((s) => s.name === 'diff')).toMatchObject({ items: 1, itemsMeta: [] });
  });

  it('without measure: tokens are null and no hash exists anywhere', () => {
    const { sections } = assemblePrompt(FULL);
    expect(sections.every((s) => s.tokens === null)).toBe(true);
    expect(sections.flatMap((s) => s.itemsMeta).every((i) => i.tokens === null && !('hash' in i))).toBe(true);
  });

  it('with measure: every section gets the injected token estimate', () => {
    const spy = vi.fn(measure);
    const { sections } = assemblePrompt(FULL, { measure: spy });
    expect(sections.every((s) => typeof s.tokens === 'number')).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('metadata carries no prompt text (nor the secrets in it)', () => {
    const json = JSON.stringify(
      assemblePrompt({ ...FULL, skills: [`${SENT.skill} sk-or-v1-SENTINELSECRET0000000000000000 ghp_SENTINEL000000000000000000000000`] }, { measure }).sections,
    );
    expect(json).not.toContain('SENTINEL');
    expect(json).not.toContain('sk-or-');
    expect(json).not.toContain('ghp_');
  });

  it('messages and assembly are byte-identical with and without measure', () => {
    const plain = assemblePrompt(FULL);
    const measured = assemblePrompt(FULL, { measure });
    expect(measured.messages).toEqual(plain.messages);
    expect(measured.assembly).toEqual(plain.assembly);
    expect(JSON.stringify(measured.messages)).toBe(JSON.stringify(plain.messages));
    expect(JSON.stringify(measured.assembly)).toBe(JSON.stringify(plain.assembly));
  });

  it('a measure that throws is not swallowed (callers must wrap), and assembly stays pure otherwise', () => {
    expect(() =>
      assemblePrompt(FULL, {
        measure: () => {
          throw new Error('tokenizer failed');
        },
      }),
    ).toThrow('tokenizer failed');
  });
});
