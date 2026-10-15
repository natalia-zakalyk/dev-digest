import type { AgentSkillLink, Skill } from "@devdigest/shared";

/**
 * Rows for the agent's Skills tab: linked skills first in link order (= prompt
 * order), then the unlinked ones by name. Links to skills missing from the list
 * (e.g. just deleted) are dropped.
 */
export function orderedSkills(
  skills: Skill[],
  links: AgentSkillLink[],
): { linked: Skill[]; unlinked: Skill[] } {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => byId.get(l.skill_id))
    .filter((sk): sk is Skill => sk !== undefined);
  const linkedIds = new Set(linked.map((sk) => sk.id));
  const unlinked = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { linked, unlinked };
}

/** Move one item to a new index (clamped); returns a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(to, next.length - 1));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** Link (append at the end) or unlink a skill id. */
export function toggleLinked(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Case-insensitive name / description / type match for the tab's filter box. */
export function matchesFilter(skill: Skill, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return `${skill.name} ${skill.description} ${skill.type}`.toLowerCase().includes(q);
}
