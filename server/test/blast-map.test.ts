import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { toBlastRadius, buildSummary } from '../src/modules/blast/domain/map.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastCallerRow, BlastResult } from '../src/modules/repo-intel/types.js';

const caller = (file: string, via: string, line = 1, rank = 0.5, symbol = 'fn'): BlastCallerRow => ({
  file,
  symbol,
  viaSymbol: via,
  line,
  rank,
});
const result = (over: Partial<BlastResult> = {}): BlastResult => ({
  changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
  callers: [],
  impactedEndpoints: [],
  ...over,
});
const ok = { degraded: false } as const;

describe('toBlastRadius', () => {
  it('groups flat callers per changed symbol into downstream', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function' },
          { file: 'src/a.ts', name: 'beta', kind: 'function' },
          { file: 'src/a.ts', name: 'lonely', kind: 'function' },
        ],
        callers: [caller('src/x.ts', 'alpha', 3), caller('src/y.ts', 'beta', 4), caller('src/z.ts', 'alpha', 5)],
      }),
      ok,
    );
    expect(BlastRadiusResponse.safeParse(r).success).toBe(true);
    expect(r.downstream.map((d) => [d.symbol, d.callers.length])).toEqual([
      ['alpha', 2],
      ['beta', 1],
    ]);
    expect(r.changed_symbols).toHaveLength(3); // symbol without callers stays in changed_symbols
  });

  it('never lists the declaring file among its own callers (also with the same name in two files)', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function' },
          { file: 'src/b.ts', name: 'alpha', kind: 'function' },
        ],
        callers: [caller('src/a.ts', 'alpha'), caller('src/b.ts', 'alpha'), caller('src/c.ts', 'alpha')],
      }),
      ok,
    );
    expect(r.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/c.ts']);
  });

  it('does not cap callers itself: the facade already limits them', () => {
    const callers = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => caller(`src/c${i}.ts`, 'alpha', 1, i));
    const r = toBlastRadius(result({ callers }), ok);
    expect(r.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL + 5);
    expect(r.downstream[0]!.callers[0]!.file).toBe(`src/c${MAX_CALLERS_PER_SYMBOL + 4}.ts`); // highest rank first
  });

  it('dedupes by file:line:name and sorts by rank, file, line', () => {
    const r = toBlastRadius(
      result({
        callers: [caller('src/b.ts', 'alpha', 2, 1), caller('src/b.ts', 'alpha', 2, 1), caller('src/a2.ts', 'alpha', 9, 1), caller('src/a2.ts', 'alpha', 1, 1)],
      }),
      ok,
    );
    expect(r.downstream[0]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual(['src/a2.ts:1', 'src/a2.ts:9', 'src/b.ts:2']);
  });

  it('attributes endpoints and crons only to the group whose callers live in that file', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function' },
          { file: 'src/a.ts', name: 'beta', kind: 'function' },
        ],
        callers: [caller('src/api.ts', 'alpha'), caller('src/job.ts', 'beta')],
        factsByFile: {
          'src/api.ts': { endpoints: ['GET /items'], crons: [] },
          'src/job.ts': { endpoints: [], crons: ['0 * * * *'] },
        },
      }),
      ok,
    );
    const by = Object.fromEntries(r.downstream.map((d) => [d.symbol, d]));
    expect(by.alpha!.endpoints_affected).toEqual(['GET /items']);
    expect(by.alpha!.crons_affected).toEqual([]);
    expect(by.beta!.crons_affected).toEqual(['0 * * * *']);
    expect(by.beta!.endpoints_affected).toEqual([]);
  });

  it('attributes endpoints/crons per caller; group arrays are the union; no facts -> []', () => {
    const r = toBlastRadius(
      result({
        callers: [
          caller('src/api.ts', 'alpha', 1, 0.9),
          caller('src/job.ts', 'alpha', 2, 0.8),
          caller('src/both.ts', 'alpha', 3, 0.7),
          caller('src/plain.ts', 'alpha', 4, 0.6),
          caller('src/a.ts', 'alpha', 5, 1), // declaring file: dropped
        ],
        factsByFile: {
          'src/api.ts': { endpoints: ['GET /items', 'GET /items', 'GET /a'], crons: [] },
          'src/job.ts': { endpoints: [], crons: ['0 * * * *'] },
          'src/both.ts': { endpoints: ['GET /items'], crons: ['0 * * * *', '*/5 * * * *'] },
          'src/a.ts': { endpoints: ['GET /decl'], crons: [] },
        },
      }),
      ok,
    );
    const d = r.downstream[0]!;
    const by = Object.fromEntries(d.callers.map((c) => [c.file, c]));
    expect(Object.keys(by)).toEqual(['src/api.ts', 'src/job.ts', 'src/both.ts', 'src/plain.ts']);
    expect(by['src/api.ts']).toMatchObject({ endpoints_affected: ['GET /a', 'GET /items'], crons_affected: [] });
    expect(by['src/job.ts']).toMatchObject({ endpoints_affected: [], crons_affected: ['0 * * * *'] });
    expect(by['src/both.ts']).toMatchObject({ endpoints_affected: ['GET /items'], crons_affected: ['*/5 * * * *', '0 * * * *'] });
    expect(by['src/plain.ts']).toMatchObject({ endpoints_affected: [], crons_affected: [] });
    expect(d.endpoints_affected).toEqual(['GET /a', 'GET /items']);
    expect(d.crons_affected).toEqual(['*/5 * * * *', '0 * * * *']);
    expect(r.counts).toEqual({ symbols: 1, callers: 4, endpoints: 2, crons: 2 });
    expect(BlastRadiusResponse.safeParse(r).success).toBe(true);
  });

  it('leaves endpoints/crons empty without factsByFile', () => {
    const r = toBlastRadius(result({ callers: [caller('src/x.ts', 'alpha')] }), ok);
    expect(r.downstream[0]!.endpoints_affected).toEqual([]);
    expect(r.downstream[0]!.callers[0]).toMatchObject({ endpoints_affected: [], crons_affected: [] });
    expect(r.counts.endpoints).toBe(0);
  });

  it('computes counts with unique endpoints/crons and a numeric summary', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function' },
          { file: 'src/a.ts', name: 'beta', kind: 'function' },
        ],
        callers: [caller('src/api.ts', 'alpha', 1), caller('src/api.ts', 'beta', 2), caller('src/x.ts', 'alpha', 3)],
        factsByFile: { 'src/api.ts': { endpoints: ['GET /items'], crons: ['* * * * *'] } },
      }),
      ok,
    );
    expect(r.counts).toEqual({ symbols: 2, callers: 3, endpoints: 1, crons: 1 });
    expect(r.summary).toBe('2 symbols changed · 3 callers · 1 endpoint · 1 cron');
  });

  it('passes degraded/reason through; index_partial extends the summary', () => {
    const partial = toBlastRadius(result({ callers: [caller('src/x.ts', 'alpha')] }), { degraded: true, reason: 'index_partial' });
    expect(partial.degraded).toBe(true);
    expect(partial.reason).toBe('index_partial');
    expect(partial.summary.endsWith(' · index partial')).toBe(true);
    const off = toBlastRadius(result(), { degraded: true, reason: 'flag_off' });
    expect(off.reason).toBe('flag_off');
    expect(off.summary).not.toContain('index partial');
  });

  it('handles empty input', () => {
    const r = toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [] }, { degraded: true, reason: 'no_data' });
    expect(r.downstream).toEqual([]);
    expect(r.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(BlastRadiusResponse.safeParse(r).success).toBe(true);
  });

  it('uses singular forms for 1', () => {
    expect(buildSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 1 }, null)).toBe('1 symbol changed · 1 caller · 1 endpoint · 1 cron');
  });
});
