import type { IntentSource } from "@devdigest/shared";
import { SOURCE_MESSAGE_KEY, VISIBLE_SOURCE_KINDS } from "./constants";

export interface SourceLabel {
  key: (typeof SOURCE_MESSAGE_KEY)[keyof typeof SOURCE_MESSAGE_KEY];
  ref: string;
}

/** Sources that were actually read and are worth showing, as message key + ref (deduped by key+ref). */
export function visibleSources(sources: IntentSource[]): SourceLabel[] {
  const shown: ReadonlySet<string> = new Set(VISIBLE_SOURCE_KINDS);
  const seen = new Set<string>();
  const out: SourceLabel[] = [];
  for (const s of sources) {
    if (!s.fetched || !shown.has(s.kind)) continue;
    const id = `${s.kind}:${s.ref}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ key: SOURCE_MESSAGE_KEY[s.kind], ref: s.ref });
  }
  return out;
}

/** Date part of an ISO timestamp (stable across locales/timezones for display + tests). */
export const shortDate = (iso: string): string => iso.slice(0, 10);
