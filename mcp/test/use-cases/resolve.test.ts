import { describe, expect, it } from 'vitest';
import { AgentNotFound, MAX_LISTED_VALUES, PrNotImported, RepoNotImported } from './imports.js';
import { createResolver } from '../../src/resolve.js';
import { agent, FakeApi, FakeClock, PULL, REPO } from './fakes.js';

const setup = () => {
  const api = new FakeApi();
  const clock = new FakeClock();
  return { api, clock, resolver: createResolver(api, clock, 60_000) };
};

describe('resolver', () => {
  it('resolves repo case-insensitively and caches it for 60 s', async () => {
    const { api, clock, resolver } = setup();
    expect(await resolver.repo('acme/SHOP')).toEqual(REPO);
    await resolver.repo('ACME/shop');
    expect(api.count('findRepo')).toBe(1);
    clock.t += 60_001;
    await resolver.repo('acme/shop');
    expect(api.count('findRepo')).toBe(2);
  });

  it('propagates RepoNotImported and does not cache failures', async () => {
    const { api, resolver } = setup();
    await expect(resolver.repo('x/y')).rejects.toBeInstanceOf(RepoNotImported);
    await expect(resolver.repo('x/y')).rejects.toBeInstanceOf(RepoNotImported);
    expect(api.count('findRepo')).toBe(2);
  });

  it('resolves a PR and propagates PrNotImported', async () => {
    const { resolver } = setup();
    expect(await resolver.pull(REPO, 12)).toEqual(PULL);
    await expect(resolver.pull(REPO, 99)).rejects.toBeInstanceOf(PrNotImported);
  });

  it('caches agents, then refreshes once on a miss before failing', async () => {
    const { api, resolver } = setup();
    expect((await resolver.agent('a1')).id).toBe('a1');
    await resolver.agent('a1');
    expect(api.count('listAgents')).toBe(1);
    api.agents = [agent(), agent({ id: 'a2', name: 'perf' })];
    expect((await resolver.agent('a2')).id).toBe('a2');
    expect(api.count('listAgents')).toBe(2);
  });

  it('AgentNotFound carries the capped list of valid agents', async () => {
    const { api, resolver } = setup();
    api.agents = Array.from({ length: 15 }, (_, i) => agent({ id: `a${i}`, name: `n${i}` }));
    const err = await resolver.agent('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentNotFound);
    const e = err as AgentNotFound;
    expect(e.agent).toBe('nope');
    expect(e.validAgents).toHaveLength(MAX_LISTED_VALUES);
    expect(e.totalAgents).toBe(15);
    expect(e.validAgents[0]).toEqual({ id: 'a0', name: 'n0' });
  });
});
