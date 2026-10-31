import { describe, expect, it } from 'vitest';
import { shortId, slugWithId } from '../src/platform/short-id.js';

describe('shortId', () => {
  it('returns an id of the requested length', () => {
    expect(shortId(8)).toHaveLength(8);
  });

  it('is unique across calls', () => {
    expect(shortId(12)).not.toBe(shortId(12));
  });
});

describe('slugWithId', () => {
  it('lower-cases the title and appends an id', () => {
    expect(slugWithId('Add Rate Limiting')).toMatch(/^add-rate-limiting-[\w-]{8}$/);
  });
});
