import { ELLIPSIS } from '../constants.js';

/** Cut untrusted text to at most `cap` characters (ellipsis included). Returned as data, never interpreted. */
export function truncateText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  if (cap <= ELLIPSIS.length) return ELLIPSIS.slice(0, cap);
  // Do not split a surrogate pair.
  let end = cap - ELLIPSIS.length;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end) + ELLIPSIS;
}

/** `a, b, c, …` with at most `max` entries; `, …` marks a cut list (used by error texts). */
export function capList(values: readonly string[], max: number): string {
  const shown = values.slice(0, max).join(', ');
  return values.length > max ? `${shown}, ${ELLIPSIS}` : shown;
}

/** `scheme://host:port` of a URL; never credentials, path, query or hash. Unparsable input gives a placeholder. */
export function originOf(url: string): string {
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? '<invalid url>' : origin;
  } catch {
    return '<invalid url>';
  }
}
