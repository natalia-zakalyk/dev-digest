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
    agents_count: agents.length,
    pull_frequency: stats.pull_frequency,
    accept_rate: stats.accept_rate,
  };
}
