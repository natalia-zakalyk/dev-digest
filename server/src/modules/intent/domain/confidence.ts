import type { IntentBasis, IntentConfidence } from '@devdigest/shared';
import { MIN_DESCRIPTION_CHARS } from '../constants.js';

const ORDER: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Strip PR-template boilerplate (HTML comments, empty checklist items, headings)
 * so a description that is only the template does not count as documented.
 */
export function meaningfulDescription(body: string | null | undefined): string {
  return (body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[-*]\s*\[[ xX]?\]\s*$/.test(l))
    .filter((l) => !/^#{1,6}\s/.test(l))
    .join('\n');
}

export const isDocumentedDescription = (body: string | null | undefined): boolean =>
  meaningfulDescription(body).length >= MIN_DESCRIPTION_CHARS;

/**
 * Deterministic confidence ceiling — the model can never exceed it.
 *   high   = documented description AND at least one linked issue/doc fetched
 *   medium = documented description only
 *   low    = no documented description (indirect signals only)
 */
export function confidenceCap(documented: boolean, fetchedLinks: number): IntentConfidence {
  if (!documented) return 'low';
  return fetchedLinks > 0 ? 'high' : 'medium';
}

/** `min(model, cap)`. */
export function clampConfidence(model: IntentConfidence, cap: IntentConfidence): IntentConfidence {
  return ORDER[model] <= ORDER[cap] ? model : cap;
}

export const basisFor = (cap: IntentConfidence): IntentBasis => (cap === 'low' ? 'inferred' : 'documented');
