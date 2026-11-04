import { describe, it, expect, vi } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { NotFoundError } from '../src/platform/errors.js';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastIntel, BlastSource } from '../src/modules/blast/ports.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { BlastResult, IndexState, IndexStatus, RepoIntel } from '../src/modules/repo-intel/types.js';

const PR = 'pr-1';
const REPO = 'repo-1';

const blast: BlastResult = {
  changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
  callers: [
    { file: 'src/a.ts', symbol: 'self', viaSymbol: 'alpha', line: 2, rank: 1 },
    { file: 'src/x.ts', symbol: 'x', viaSymbol: 'alpha', line: 7, rank: 0.5 },
  ],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'src/x.ts': { endpoints: ['GET /x'], crons: [] } },
  degraded: false,
};

const state = (status: IndexStatus, degradedReason?: IndexState['degradedReason']): IndexState => ({
  repoId: REPO,
  status,
  filesIndexed: 1,
  filesSkipped: 0,
  durationMs: 0,
  lastIndexedSha: 'sha',
  indexerVersion: 2,
  updatedAt: new Date(0),
  degradedReason,
});

function setup(opts: { status?: IndexStatus; reason?: IndexState['degradedReason']; known?: boolean; enabled?: boolean; result?: BlastResult } = {}) {
  const source: BlastSource = {
    getPull: async () => (opts.known === false ? undefined : { id: PR, repoId: REPO }),
    getPrFiles: async () => [{ path: 'src/a.ts' }],
  };
  const intel = {
    getBlastRadius: vi.fn(async () => opts.result ?? blast),
    getIndexState: vi.fn(async () => state(opts.status ?? 'full', opts.reason)),
  } satisfies BlastIntel;
  const log = { info: vi.fn() };
  const service = new BlastService({ source, intel, repoIntelEnabled: opts.enabled ?? true });
  return { service, intel, log };
}

describe('BlastService', () => {
  it('full index: one facade call, not degraded, declaring file dropped, logs the index read', async () => {
    const { service, intel, log } = setup();
    const r = await service.get('ws', PR, log);
    expect(intel.getBlastRadius).toHaveBeenCalledTimes(1);
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/x.ts']);
    expect(BlastRadiusResponse.safeParse(r).success).toBe(true);
    expect(log.info).toHaveBeenCalledTimes(1);
    const [obj, msg] = log.info.mock.calls[0]!;
    expect(msg).toBe('blast: read prebuilt index');
    expect(obj).toMatchObject({ source: 'repo_index', index_status: 'full', symbols: 1, callers: 1, endpoints: 1, crons: 0 });
  });

  it('partial index: data plus index_partial', async () => {
    const { service, intel, log } = setup({ status: 'partial' });
    const r = await service.get('ws', PR, log);
    expect(intel.getBlastRadius).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(r.counts.callers).toBe(1);
    expect(r.summary.endsWith('index partial')).toBe(true);
  });

  it('flag off: no facade call, flag_off, empty data', async () => {
    const { service, intel, log } = setup({ enabled: false });
    const r = await service.get('ws', PR, log);
    expect(intel.getBlastRadius).not.toHaveBeenCalled();
    expect(intel.getIndexState).not.toHaveBeenCalled();
    expect(r).toMatchObject({ degraded: true, reason: 'flag_off', downstream: [], changed_symbols: [] });
    expect(log.info.mock.calls[0]![1]).toBe('blast: index unusable, skipped');
  });

  it.each([
    ['failed', undefined, 'index_failed'],
    ['degraded', undefined, 'no_data'],
    ['degraded', 'repo_too_large', 'repo_too_large'],
  ] as const)('status %s (%s): no facade call, reason %s', async (status, degradedReason, expected) => {
    const { service, intel, log } = setup({ status, reason: degradedReason });
    const r = await service.get('ws', PR, log);
    expect(intel.getBlastRadius).not.toHaveBeenCalled();
    expect(r).toMatchObject({ degraded: true, reason: expected, downstream: [] });
  });

  it('facade race (degraded result) passes reason, defaulting to no_data', async () => {
    const { service } = setup({ result: { ...blast, degraded: true } });
    const r = await service.get('ws', PR, { info: vi.fn() });
    expect(r).toMatchObject({ degraded: true, reason: 'no_data' });
  });

  it('unknown PR -> NotFoundError', async () => {
    const { service, intel } = setup({ known: false });
    await expect(service.get('ws', PR, { info: vi.fn() })).rejects.toBeInstanceOf(NotFoundError);
    expect(intel.getBlastRadius).not.toHaveBeenCalled();
  });
});

describe('GET /pulls/:id/blast', () => {
  it('returns 422 for a non-uuid id', async () => {
    const app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv) });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  // Hermetic 200 path. `getPull`/`getPrFiles` read Postgres through the container's cached ReviewRepository
  // (no ContainerOverrides slot for it), so they are stubbed on that instance; the plugin holds the same
  // instance. MockAuthProvider avoids the DB lookup of LocalNoAuthProvider. The 404 route stays in blast.it.test.ts.
  it('returns 200 with the grouped map, counts, summary and degraded:false', async () => {
    const flat: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
      callers: [
        { file: 'src/a.ts', symbol: 'self', viaSymbol: 'alpha', line: 2, rank: 1 },
        { file: 'src/routes.ts', symbol: 'handler', viaSymbol: 'alpha', line: 7, rank: 0.9 },
        { file: 'src/jobs.ts', symbol: 'nightly', viaSymbol: 'alpha', line: 3, rank: 0.5 },
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'src/routes.ts': { endpoints: ['GET /x'], crons: [] },
        'src/jobs.ts': { endpoints: [], crons: ['0 3 * * *'] },
      },
      degraded: false,
    };
    const repoIntel = {
      getBlastRadius: vi.fn(async () => flat),
      getIndexState: vi.fn(async () => state('full')),
    } as unknown as RepoIntel;

    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true' } as NodeJS.ProcessEnv),
      overrides: { repoIntel, auth: new MockAuthProvider() },
    });
    try {
      const repo = app.container.reviewRepo;
      vi.spyOn(repo, 'getPull').mockResolvedValue({ id: PR, repoId: REPO } as Awaited<ReturnType<typeof repo.getPull>>);
      vi.spyOn(repo, 'getPrFiles').mockResolvedValue([{ path: 'src/a.ts' }] as Awaited<ReturnType<typeof repo.getPrFiles>>);

      const res = await app.inject({ method: 'GET', url: `/pulls/${'11111111-1111-4111-8111-111111111111'}/blast` });
      expect(res.statusCode).toBe(200);
      const body = BlastRadiusResponse.parse(res.json());
      expect(body.degraded).toBe(false);
      expect(body.counts).toEqual({ symbols: 1, callers: 2, endpoints: 1, crons: 1 });
      expect(body.summary).toBe('1 symbol changed · 2 callers · 1 endpoint · 1 cron');
      expect(body.downstream).toHaveLength(1);
      expect(body.downstream[0]).toMatchObject({
        symbol: 'alpha',
        endpoints_affected: ['GET /x'],
        crons_affected: ['0 3 * * *'],
      });
      expect(body.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/routes.ts', 'src/jobs.ts']);
      expect(body.downstream[0]!.callers).toMatchObject([
        { file: 'src/routes.ts', endpoints_affected: ['GET /x'], crons_affected: [] },
        { file: 'src/jobs.ts', endpoints_affected: [], crons_affected: ['0 3 * * *'] },
      ]);
      expect(repoIntel.getBlastRadius).toHaveBeenCalledWith(REPO, ['src/a.ts']);
    } finally {
      await app.close();
    }
  });
});
