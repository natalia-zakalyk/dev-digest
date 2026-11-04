import type { BlastRadiusResponse, BlastDegradedReason } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, DegradedReason } from '../../repo-intel/types.js';

// Compile-time guard: every repo-intel degraded reason is a valid wire reason.
const _reasonsAssignable: DegradedReason extends BlastDegradedReason ? true : never = true;
void _reasonsAssignable;

export interface ToBlastOptions {
  degraded: boolean;
  reason?: BlastDegradedReason | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSummary(
  counts: BlastRadiusResponse['counts'],
  reason: BlastDegradedReason | null | undefined,
): string {
  const parts = [
    `${plural(counts.symbols, 'symbol', 'symbols')} changed`,
    plural(counts.callers, 'caller', 'callers'),
    plural(counts.endpoints, 'endpoint', 'endpoints'),
    plural(counts.crons, 'cron', 'crons'),
  ];
  if (reason === 'index_partial') parts.push('index partial');
  return parts.join(' · ');
}

const sortedUnique = (xs: readonly string[] | undefined): string[] => [...new Set(xs ?? [])].sort();

const byRankThenPlace = (a: BlastCallerRow, b: BlastCallerRow) =>
  b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line;

/**
 * Pure mapping of the repo-intel `BlastResult` to the API response: groups the flat callers per
 * changed symbol, drops a symbol's own declaring file and attributes endpoints/crons through
 * `factsByFile` per caller (group-level arrays are the union of its callers' facts).
 * The summary is built from numbers only. No caps here: `repoIntel.getBlastRadius` already
 * limits the callers (`MAX_CALLERS_PER_SYMBOL`), so the limit lives in one place.
 */
export function toBlastRadius(result: BlastResult, opts: ToBlastOptions): BlastRadiusResponse {
  const reason = opts.reason ?? null;

  const declFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const set = declFiles.get(s.name) ?? new Set<string>();
    set.add(s.file);
    declFiles.set(s.name, set);
  }

  const groups = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    const list = groups.get(c.viaSymbol) ?? [];
    list.push(c);
    groups.set(c.viaSymbol, list);
  }

  const entries = [...groups.entries()].flatMap(([symbol, rows]) => {
    const seen = new Set<string>();
    const kept = rows
      .filter((r) => {
        const key = `${r.file}:${r.line}:${r.symbol}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(byRankThenPlace);
    if (kept.length === 0) return [];
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    const callers = kept.map((r) => {
      const facts = result.factsByFile?.[r.file];
      facts?.endpoints.forEach((e) => endpoints.add(e));
      facts?.crons.forEach((e) => crons.add(e));
      return {
        name: r.symbol,
        file: r.file,
        line: r.line,
        endpoints_affected: sortedUnique(facts?.endpoints),
        crons_affected: sortedUnique(facts?.crons),
      };
    });
    return [
      {
        bestRank: kept[0]!.rank,
        item: {
          symbol,
          callers,
          endpoints_affected: [...endpoints].sort(),
          crons_affected: [...crons].sort(),
        },
      },
    ];
  });
  entries.sort((a, b) => b.bestRank - a.bestRank || a.item.symbol.localeCompare(b.item.symbol));
  const downstream = entries.map((e) => e.item);

  const counts = {
    symbols: result.changedSymbols.length,
    callers: downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: new Set(downstream.flatMap((d) => d.endpoints_affected)).size,
    crons: new Set(downstream.flatMap((d) => d.crons_affected)).size,
  };

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: buildSummary(counts, reason),
    counts,
    degraded: opts.degraded,
    reason,
  };
}
