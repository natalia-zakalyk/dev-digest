/** Helpers shared by the /agents routes (list + editor). */

/** Link to an agent's editor, optionally on a specific tab (default: config). */
export function agentEditorHref(id: string, tab = "config"): string {
  return `/agents/${encodeURIComponent(id)}?tab=${encodeURIComponent(tab)}`;
}
