import { describe, it, expect } from 'vitest';
import type { ConventionExtraction, GitClient } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { verifyCandidates } from '../src/modules/conventions/domain/verify.js';
import { buildSkillDraft } from '../src/modules/conventions/domain/skill-draft.js';
import { numberLines } from '../src/modules/conventions/domain/sampling.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type { ConventionsRepo } from '../src/modules/conventions/ports.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';

/** Conventions extractor — hermetic: fake repo/git/repoIntel, MockLLMProvider (no DB, no keys). */

const FILE = ['import a from "a";', 'const x = await get();', '', 'const y = await post();'].join('\n');
const cand = (over: Partial<ConventionExtraction['candidates'][number]> = {}) => ({
  category: 'async',
  rule: 'Use async/await instead of .then()',
  evidence: { path: 'src/a.ts', line_start: 2, line_end: 2 },
  confidence: 0.9,
  ...over,
});

describe('verifyCandidates', () => {
  const files = new Map([['src/a.ts', FILE]]);

  it('keeps real evidence and reads the snippet from the file', () => {
    const { verified, dropped } = verifyCandidates([cand({ evidence: { path: 'src/a.ts', line_start: 2, line_end: 4 } })], files);
    expect(dropped).toBe(0);
    expect(verified[0]?.evidenceSnippet).toBe('const x = await get();\n\nconst y = await post();');
  });

  it('drops missing file, out-of-range lines, blank snippet, low confidence and duplicates', () => {
    const { verified, dropped } = verifyCandidates(
      [
        cand({ rule: 'r1', evidence: { path: 'src/nope.ts', line_start: 1, line_end: 1 } }),
        cand({ rule: 'r2', evidence: { path: 'src/a.ts', line_start: 2, line_end: 99 } }),
        cand({ rule: 'r3', evidence: { path: 'src/a.ts', line_start: 3, line_end: 3 } }),
        cand({ rule: 'r4', confidence: 0.2 }),
        cand({ rule: 'ok' }),
        cand({ rule: ' OK ' }),
      ],
      files,
    );
    expect(verified.map((v) => v.rule)).toEqual(['ok']);
    expect(dropped).toBe(5);
  });
});

describe('buildSkillDraft / numberLines', () => {
  it('merges accepted conventions into one section each', () => {
    const d = buildSkillDraft('payments-api', [
      { rule: 'Use async/await', category: 'async', evidencePath: 'src/a.ts', evidenceLineStart: 2, evidenceLineEnd: 4, evidenceSnippet: 'x' },
      { rule: 'Redis via singleton', category: null, evidencePath: null, evidenceLineStart: null, evidenceLineEnd: null, evidenceSnippet: null },
    ]);
    expect(d).toMatchObject({ name: 'repo-conventions', type: 'convention' });
    expect(d.body).toContain('## use-async-await');
    expect(d.body).toContain('`src/a.ts:2-4`');
    expect(d.body).toContain('## redis-via-singleton');
  });

  it('numbers lines from 1', () => {
    expect(numberLines('a\nb')).toBe('1: a\n2: b');
  });
});

function build(structured: unknown, opts: { files?: Record<string, string>; statuses?: Record<string, string> } = {}) {
  const files = opts.files ?? { 'src/a.ts': FILE };
  const store: any[] = [];
  const repo = {
    getRepo: async (_w: string, id: string) => (id === 'r1' ? { owner: 'o', name: 'n' } : undefined),
    listByRepo: async () => store,
    listByIds: async (_w: string, _r: string, ids: string[]) => store.filter((r) => ids.includes(r.id)),
    upsertCandidates: async (_w: string, _r: string, _s: string, items: any[]) => {
      for (const i of items) {
        const old = store.find((r) => r.rule === i.rule);
        if (old) Object.assign(old, { evidenceSnippet: i.evidenceSnippet });
        else store.push({ id: `c${store.length}`, status: 'pending', createdAt: new Date(), ...i });
      }
    },
    update: async () => undefined,
  } as unknown as ConventionsRepo;
  const git = {
    readFile: async (_r: unknown, p: string) => {
      if (p in files) return files[p]!;
      throw new Error('ENOENT');
    },
  } as unknown as GitClient;
  const llm = new MockLLMProvider('openai', { structured });
  const svc = new ConventionsService({
    repo,
    git,
    repoIntel: { getConventionSamples: async () => Object.keys(files) },
    llm: async () => llm,
    resolveModel: async () => ({ provider: 'openai', model: 'cheap' }),
  });
  return { svc, store, llm };
}

describe('ConventionsService.extract', () => {
  it('persists only verified candidates and reports dropped', async () => {
    const { svc, store } = build({
      candidates: [cand(), cand({ rule: 'ghost', evidence: { path: 'src/ghost.ts', line_start: 1, line_end: 1 } })],
    });
    const res = await svc.extract('w', 'r1');
    expect(res.stats).toMatchObject({ proposed: 2, verified: 1, dropped: 1, sample_files: 1 });
    expect(store).toHaveLength(1);
    expect(res.candidates[0]?.evidence_snippet).toBe('const x = await get();');
  });

  it('re-scan does not duplicate rules', async () => {
    const { svc, store } = build({ candidates: [cand()] });
    await svc.extract('w', 'r1');
    await svc.extract('w', 'r1');
    expect(store).toHaveLength(1);
  });

  it('fails clearly when nothing is readable, and 404s an unknown repo', async () => {
    await expect(build({ candidates: [] }, { files: {} }).svc.extract('w', 'r1')).rejects.toBeInstanceOf(ValidationError);
    await expect(build({ candidates: [] }).svc.extract('w', 'zzz')).rejects.toThrow(/not found/i);
  });
});

describe('ConventionsService.update', () => {
  it('throws NotFoundError when the convention does not exist in the workspace', async () => {
    const { svc } = build({ candidates: [] });
    await expect(svc.update('w', 'missing', { status: 'accepted' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ConventionsService.skillDraft', () => {
  it('uses accepted rows only; 422 when none', async () => {
    const { svc, store } = build({ candidates: [cand()] });
    await svc.extract('w', 'r1');
    await expect(svc.skillDraft('w', 'r1', ['c0'])).rejects.toBeInstanceOf(ValidationError);
    store[0].status = 'accepted';
    const draft = await svc.skillDraft('w', 'r1', ['c0']);
    expect(draft.body).toContain('Use async/await');
  });
});
