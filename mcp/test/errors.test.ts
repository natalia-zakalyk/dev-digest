import { describe, expect, it } from 'vitest';
import {
  AgentNotFound, ApiError, ApiUnreachable, DevDigestError, InvalidBaseUrl, PrNotImported,
  RepoNotImported, RunFailed, RunNotFound, RunRateLimited,
} from '../src/errors.js';

describe('semantic errors', () => {
  const all = [
    new AgentNotFound('x', [{ id: 'a', name: 'A' }], 1),
    new RepoNotImported('o/n', ['o/m']),
    new PrNotImported('o/n', 3),
    new RunRateLimited(30),
    new ApiUnreachable('http://localhost:3001'),
    new RunFailed('r1', 'boom'),
    new RunNotFound('r1', 'o/n', 3),
    new ApiError(500, 'listAgents', 'oops'),
    new InvalidBaseUrl('http://example.com'),
  ];
  it('are DevDigestError with unique kind and class name', () => {
    for (const e of all) {
      expect(e).toBeInstanceOf(DevDigestError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe(e.constructor.name);
    }
    expect(new Set(all.map((e) => e.kind)).size).toBe(all.length);
  });
  it('carry the data the catalog needs', () => {
    expect(all[0]).toMatchObject({ agent: 'x', validAgents: [{ id: 'a', name: 'A' }], totalAgents: 1 });
    expect(all[3]).toMatchObject({ retryAfterSeconds: 30 });
    expect(all[4]).toMatchObject({ base: 'http://localhost:3001' });
    expect(all[8]).toMatchObject({ reason: 'not_loopback' });
    expect(new InvalidBaseUrl('http://x', 'malformed').message).toMatch(/without username, password, query or hash/);
  });
});
