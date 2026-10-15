/** Rough token estimate (≈ 4 chars/token) for skill-body counters. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
