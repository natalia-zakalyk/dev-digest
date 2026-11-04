import { MAX_RESPONSE_CHARS } from '../constants.js';

/** Serialized size of a result, as the tools ring will emit it (JSON). */
export function serializedSize(value: unknown): number {
  return JSON.stringify(value).length;
}

/**
 * Global output-size guard (spec "Cutting order", step 3). `build(keep)` renders the result
 * with its first `keep` findings/items; returns the render with the largest `keep <= maxCount`
 * that fits `maxChars`. Size is monotone in `keep`, so binary search. If even `keep = 0` is
 * over budget it returns that render (text caps make this practically unreachable).
 */
export function fitToBudget<T>(
  maxCount: number,
  build: (keep: number) => T,
  maxChars: number = MAX_RESPONSE_CHARS,
): T {
  const full = build(maxCount);
  if (serializedSize(full) <= maxChars) return full;
  let lo = 0;
  let hi = maxCount - 1;
  let best = build(0);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = build(mid);
    if (serializedSize(candidate) <= maxChars) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
