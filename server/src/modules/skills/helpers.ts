import type { Skill, SkillSource, SkillStats, SkillSummary, SkillType, SkillVersion } from '@devdigest/shared';

/** Pure helpers for the skills module — record → DTO mapping and prompt-block formatting. */

/**
 * The persisted shape the helpers need (structurally matches the `skills` row,
 * declared here so this pure ring never imports the DB layer).
 */
export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
}

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRecord): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * One skill as a prompt block. reviewer-core joins the blocks under
 * `## Skills / rules`, so each skill gets its own `###` heading — the order of
 * blocks is the agent's link order.
 */
export function formatSkillBlock(skill: Pick<SkillRecord, 'name' | 'description' | 'body'>): string {
  const description = skill.description.trim();
  return [`### ${skill.name}`, ...(description ? [`_${description}_`] : []), '', skill.body.trim()].join(
    '\n',
  );
}

/** Map a `skill_versions` row; `current` is the skill's live version number. */
export function toSkillVersion(
  row: { version: number; body: string; changeNote?: string | null; createdAt: Date },
  current: number,
): SkillVersion {
  return {
    version: row.version,
    body: row.body,
    change_note: row.changeNote ?? null,
    created_at: row.createdAt.toISOString(),
    is_current: row.version === current,
  };
}

const percent = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 100);

/** Roll raw usage counts up into the `SkillStats` DTO (rates are whole percents). */
export function toSkillStats(
  agents: { id: string; name: string }[],
  usage: {
    runs: number;
    runsWithSkill: number;
    accepted: number;
    dismissed: number;
    byCategory: { category: string; count: number }[];
  },
): SkillStats {
  return {
    agents,
    pull_frequency: percent(usage.runsWithSkill, usage.runs),
    accept_rate: percent(usage.accepted, usage.accepted + usage.dismissed),
    findings_30d: usage.byCategory.reduce((n, c) => n + c.count, 0),
    findings_by_category: usage.byCategory,
  };
}

/** Compact per-skill rollup for the list view (same definitions as `toSkillStats`). */
export function toSkillSummary(
  skillId: string,
  agents: { id: string; name: string }[],
  usage: Parameters<typeof toSkillStats>[1],
): SkillSummary {
  const stats = toSkillStats(agents, usage);
  return {
    skill_id: skillId,
    linked_agents: agents.length,
    pull_frequency: stats.pull_frequency,
    accept_rate: ratio(stats.accept_rate),
  };
}

/** Percent (0-100) → ratio (0-1), keeping null. */
const ratio = (pct: number | null): number | null => (pct === null ? null : pct / 100);

/** Raw workspace-wide usage rows (see `SkillsRepository.summaryUsageSince`). */
export interface SummaryUsageRows {
  links: { skillId: string; agentId: string }[];
  agentRuns: { agentId: string; runs: number }[];
  skillRuns: { agentId: string; skillId: string; runs: number }[];
  skillFindings: { agentId: string; skillId: string; accepted: number; dismissed: number }[];
}

/**
 * Combine workspace-wide usage rows into one `SkillSummary` per skill (input order).
 * Same definitions as `toSkillStats`: pull_frequency = runs of the linked agents that
 * used the skill ÷ finished runs of the linked agents; accept_rate = accepted ÷ (accepted + dismissed).
 */
export function toSkillSummaries(skillIds: string[], rows: SummaryUsageRows): SkillSummary[] {
  const agentsOf = new Map<string, Set<string>>();
  for (const l of rows.links) {
    const set = agentsOf.get(l.skillId) ?? new Set<string>();
    set.add(l.agentId);
    agentsOf.set(l.skillId, set);
  }
  const runsOfAgent = new Map(rows.agentRuns.map((r) => [r.agentId, r.runs]));

  const sumBySkill = <T extends { agentId: string; skillId: string }>(
    items: T[],
    pick: (i: T) => number,
  ): Map<string, number> => {
    const out = new Map<string, number>();
    for (const i of items) {
      if (!agentsOf.get(i.skillId)?.has(i.agentId)) continue; // only runs of agents linked to the skill
      out.set(i.skillId, (out.get(i.skillId) ?? 0) + pick(i));
    }
    return out;
  };
  const withSkill = sumBySkill(rows.skillRuns, (r) => r.runs);
  const accepted = sumBySkill(rows.skillFindings, (f) => f.accepted);
  const dismissed = sumBySkill(rows.skillFindings, (f) => f.dismissed);

  return skillIds.map((id) => {
    const agents = agentsOf.get(id) ?? new Set<string>();
    let runs = 0;
    for (const a of agents) runs += runsOfAgent.get(a) ?? 0;
    const acc = accepted.get(id) ?? 0;
    return {
      skill_id: id,
      linked_agents: agents.size,
      pull_frequency: percent(withSkill.get(id) ?? 0, runs),
      accept_rate: ratio(percent(acc, acc + (dismissed.get(id) ?? 0))),
    };
  });
}
