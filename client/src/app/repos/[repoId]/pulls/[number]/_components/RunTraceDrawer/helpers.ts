import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/**
 * Content-derived React keys for a static list: `keyOf(item)`, with `#n`
 * appended to repeats so duplicates stay unique without falling back to the index.
 */
export function withStableKeys<T>(items: readonly T[], keyOf: (item: T) => string): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { key: n === 0 ? base : `${base}#${n}`, item };
  });
}
