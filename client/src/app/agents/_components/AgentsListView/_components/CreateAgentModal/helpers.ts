/**
 * The model to submit. Keeps the user's choice while it is valid; when the provider's model list is loaded and
 * the current model is not in it (e.g. the provider was just switched), falls back to the preferred model if the
 * provider offers it, else the first listed one. With no list (key missing / still loading) the current value is kept.
 */
export function pickModel(current: string, listed: string[], preferred: string): string {
  if (listed.length === 0 || (current && listed.includes(current))) return current;
  return listed.includes(preferred) ? preferred : listed[0]!;
}
