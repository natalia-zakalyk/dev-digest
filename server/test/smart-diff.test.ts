import { describe, it, expect } from 'vitest';
import { SmartDiffResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { NotFoundError } from '../src/platform/errors.js';
import { buildSmartDiff } from '../src/modules/smart-diff/domain/build.js';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { SmartDiffSource } from '../src/modules/smart-diff/ports.js';

const PR = 'pr-1';
const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });
const finding = (id: string, f: string, startLine: number, dismissedAt: Date | null = null) => ({
  id,
  file: f,
  startLine,
  dismissedAt,
});
type Rev = Awaited<ReturnType<SmartDiffSource['reviewsForPull']>>[number];
const review = (
  id: string,
  agentId: string | null,
  findings: Rev['findings'],
  kind = 'review',
  runId: string | null = `run-${id}`,
): Rev => ({ review: { id, prId: PR, agentId, runId, kind }, findings });

type Tokens = Record<string, { tokensIn: number | null; tokensOut: number | null }>;

function fakeSource(
  files: ReturnType<typeof file>[],
  reviews: Rev[],
  known = true,
  tokens: Tokens = {},
): SmartDiffSource {
  return {
    getPull: async () => (known ? { id: PR } : undefined),
    getPrFiles: async () => files,
    reviewsForPull: async () => reviews,
    runTokens: async (ids) => ids.flatMap((id) => (tokens[id] ? [tokens[id]!] : [])),
  };
}

const FILES = [file('pnpm-lock.yaml', 10, 2), file('README.md'), file('src/a.ts', 5, 1), file('src/a.test.ts'), file('src/index.ts'), file('src/b.ts')];

describe('buildSmartDiff', () => {
  it('orders groups core, tests, wiring, docs, boilerplate and omits empty ones', () => {
    const d = buildSmartDiff(FILES, []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(buildSmartDiff([file('src/a.ts')], []).groups.map((g) => g.role)).toEqual(['core']);
  });

  it('keeps GitHub order inside a group and puts the lock file in boilerplate', () => {
    const d = buildSmartDiff(FILES, []);
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(d.groups.at(-1)!.files[0]!.path).toBe('pnpm-lock.yaml');
  });

  it('sorts and dedupes finding lines, ids follow line then id', () => {
    const d = buildSmartDiff(FILES, [finding('f3', 'src/a.ts', 9), finding('f2', 'src/a.ts', 3), finding('f1', 'src/a.ts', 3)]);
    const a = d.groups[0]!.files[0]!;
    expect(a.finding_lines).toEqual([3, 9]);
    expect(a.finding_ids).toEqual(['f1', 'f2', 'f3']);
  });

  it('ignores findings on files outside the PR and sums total_lines', () => {
    const d = buildSmartDiff(FILES, [finding('x', 'nope.ts', 1)]);
    expect(d.groups.flatMap((g) => g.files).every((f) => f.finding_ids.length === 0)).toBe(true);
    expect(d.split_suggestion).toEqual({ too_big: false, total_lines: 12 + 1 + 6 + 1 + 1 + 1, proposed_splits: [] });
    expect(() => SmartDiffResponse.parse(d)).not.toThrow();
  });
});

describe('SmartDiffService', () => {
  const idsByFile = async (reviews: Rev[]) => {
    const d = await new SmartDiffService({ source: fakeSource(FILES, reviews) }).get('ws', PR);
    return Object.fromEntries(d.groups.flatMap((g) => g.files).map((f) => [f.path, f.finding_ids]));
  };

  it('counts 2 files carrying 5 findings as 2 files with findings', async () => {
    const ids = await idsByFile([
      review('r1', 'a1', [
        finding('f1', 'src/a.ts', 1),
        finding('f2', 'src/a.ts', 2),
        finding('f3', 'src/a.ts', 3),
        finding('f4', 'src/b.ts', 1),
        finding('f5', 'src/b.ts', 2),
      ]),
    ]);
    expect(Object.values(ids).filter((l) => l.length > 0)).toHaveLength(2);
  });

  it('a rerun of the same agent replaces its findings; two agents add up', async () => {
    const ids = await idsByFile([
      review('r3', 'a1', [finding('new', 'src/a.ts', 1)]),
      review('r2', 'a2', [finding('other', 'src/a.ts', 2)]),
      review('r1', 'a1', [finding('old', 'src/a.ts', 5)]),
    ]);
    expect(ids['src/a.ts']).toEqual(['new', 'other']);
  });

  it('ignores agent-less reviews once an agent review exists, and summary reviews', async () => {
    const ids = await idsByFile([
      review('r2', 'a1', [finding('agent', 'src/a.ts', 1)]),
      review('r1', null, [finding('seeded', 'src/a.ts', 2)]),
      review('r0', 'a9', [finding('sum', 'src/a.ts', 3)], 'summary'),
    ]);
    expect(ids['src/a.ts']).toEqual(['agent']);
  });

  it('excludes dismissed findings, keeps others', async () => {
    const ids = await idsByFile([
      review('r1', 'a1', [finding('gone', 'src/a.ts', 1, new Date()), finding('kept', 'src/a.ts', 2)]),
    ]);
    expect(ids['src/a.ts']).toEqual(['kept']);
  });

  it('keeps accepted findings (only dismissed ones are excluded)', async () => {
    const accepted = { ...finding('acc', 'src/a.ts', 4), acceptedAt: new Date() };
    const d = await new SmartDiffService({ source: fakeSource(FILES, [review('r1', 'a1', [accepted])]) }).get('ws', PR);
    const a = d.groups.flatMap((g) => g.files).find((f) => f.path === 'src/a.ts')!;
    expect(a.finding_ids).toEqual(['acc']);
    expect(a.finding_lines).toEqual([4]);
  });

  it('sums tokens of the latest review run per agent only; dismissed/accepted do not matter', async () => {
    const tokens: Tokens = {
      'run-r3': { tokensIn: 100, tokensOut: 20 },
      'run-r2': { tokensIn: 50, tokensOut: null },
      'run-r1': { tokensIn: 9000, tokensOut: 9000 }, // superseded rerun of a1
      'run-r0': { tokensIn: 7000, tokensOut: 7000 }, // summary review
    };
    const reviews = [
      review('r3', 'a1', [finding('x', 'src/a.ts', 1, new Date())]),
      review('r2', 'a2', [{ ...finding('y', 'src/a.ts', 2), acceptedAt: new Date() }]),
      review('r1', 'a1', []),
      review('r0', 'a9', [], 'summary'),
    ];
    const d = await new SmartDiffService({ source: fakeSource(FILES, reviews, true, tokens) }).get('ws', PR);
    expect(d.source_tokens).toBe(170);
    expect(() => SmartDiffResponse.parse(d)).not.toThrow();
  });

  it('source_tokens is null when no review run is known', async () => {
    const svc = (reviews: Rev[]) => new SmartDiffService({ source: fakeSource(FILES, reviews) }).get('ws', PR);
    expect((await svc([])).source_tokens).toBeNull();
    expect((await svc([review('r1', null, [], 'review', null)])).source_tokens).toBeNull();
    // run row gone (e.g. deleted) -> nothing to sum
    expect((await svc([review('r1', 'a1', [])])).source_tokens).toBeNull();
  });

  it('throws NotFoundError for an unknown PR', async () => {
    const svc = new SmartDiffService({ source: fakeSource([], [], false) });
    await expect(svc.get('ws', PR)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GET /pulls/:id/smart-diff', () => {
  it('returns 422 for a non-uuid id', async () => {
    const app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv) });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
