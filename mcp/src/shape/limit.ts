import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';

/** Clamp `limit` to 1..MAX_LIMIT; missing or invalid falls back to the default (20). */
export function resolveLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}
