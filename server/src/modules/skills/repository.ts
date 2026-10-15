import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * L02 — skills data-access. Owns `skills` and `skill_versions`; the agent side of
 * `agent_skills` (link / reorder) stays in the agents repository. Workspace-scoped.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  changeNote?: string | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Stored on the new snapshot only when the body changes. */
  changeNote?: string | null;
}

export interface SkillUsage {
  runs: number;
  runsWithSkill: number;
  accepted: number;
  dismissed: number;
  byCategory: { category: string; count: number }[];
}

/** Workspace-wide raw usage rows feeding `toSkillSummaries` (see `summaryUsageSince`). */
export interface SummaryUsage {
  links: { skillId: string; agentId: string }[];
  /** Finished runs in the window, per agent. */
  agentRuns: { agentId: string; runs: number }[];
  /** Runs that had the skill in `skills_used`, per (agent, skill). */
  skillRuns: { agentId: string; skillId: string; runs: number }[];
  /** Accepted / dismissed findings of those runs, per (agent, skill). */
  skillFindings: { agentId: string; skillId: string; accepted: number; dismissed: number }[];
}

export class SkillsRepository {
  constructor(private db: DbExecutor) {}

  /** Run `fn` in ONE transaction with a repository bound to it. */
  transaction<T>(fn: (repo: SkillsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new SkillsRepository(tx)));
  }

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND snapshot its body as version 1. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.transaction(async (repo) => {
      const [row] = await repo.db
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await repo.snapshotVersion(row!, values.changeNote ?? null);
      return row!;
    });
  }

  /**
   * Update a skill. A body change bumps `version` (computed by Postgres under a
   * row lock) and snapshots the new body into `skill_versions`; toggling
   * `enabled` or editing metadata does not.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    return this.transaction(async (repo) => {
      const [existing] = await repo.db
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const [row] = await repo.db
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { version: sql`${t.skills.version} + 1` } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged && row) await repo.snapshotVersion(row, patch.changeNote ?? null);
      return row;
    });
  }

  /** Delete a skill; agent links and versions cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** Agents the skill is linked to (workspace-scoped through the skill). */
  async listLinkedAgents(skillId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(t.agentSkills.order);
  }

  /**
   * Usage since `since`: finished runs of the linked agents, how many of them had
   * this skill in the assembled prompt (`trace.prompt_assembly.skills_used`), and the findings those
   * runs produced (accepted / dismissed / by category).
   */
  async usageSince(
    workspaceId: string,
    skillId: string,
    agentIds: string[],
    since: Date,
  ): Promise<SkillUsage> {
    if (agentIds.length === 0) return { runs: 0, runsWithSkill: 0, accepted: 0, dismissed: 0, byCategory: [] };
    const used = sql`${t.runTraces.trace} -> 'prompt_assembly' -> 'skills_used' @> ${JSON.stringify([{ id: skillId }])}::jsonb`;
    const runScope = and(
      eq(t.agentRuns.workspaceId, workspaceId),
      eq(t.agentRuns.status, 'done'),
      inArray(t.agentRuns.agentId, agentIds),
      gte(t.agentRuns.ranAt, since),
    );

    const [runStats] = await this.db
      .select({
        runs: sql<number>`count(*)::int`,
        runsWithSkill: sql<number>`count(*) filter (where ${used})::int`,
      })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(runScope);

    const findingRows = await this.db
      .select({
        category: t.findings.category,
        count: sql<number>`count(*)::int`,
        accepted: sql<number>`count(${t.findings.acceptedAt})::int`,
        dismissed: sql<number>`count(${t.findings.dismissedAt})::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(and(runScope, isNotNull(t.reviews.runId), used))
      .groupBy(t.findings.category)
      .orderBy(desc(sql`count(*)`));

    return {
      runs: runStats?.runs ?? 0,
      runsWithSkill: runStats?.runsWithSkill ?? 0,
      accepted: findingRows.reduce((n, r) => n + r.accepted, 0),
      dismissed: findingRows.reduce((n, r) => n + r.dismissed, 0),
      byCategory: findingRows.map((r) => ({ category: r.category, count: r.count })),
    };
  }

  /**
   * Workspace-wide usage in a constant number of queries (links, runs, findings) —
   * same window and definitions as `usageSince`, but for every skill at once.
   */
  async summaryUsageSince(workspaceId: string, since: Date): Promise<SummaryUsage> {
    const links = await this.db
      .select({ skillId: t.agentSkills.skillId, agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.skills.workspaceId, workspaceId));
    const agentIds = [...new Set(links.map((l) => l.agentId))];
    if (agentIds.length === 0) return { links, agentRuns: [], skillRuns: [], skillFindings: [] };

    const runScope = and(
      eq(t.agentRuns.workspaceId, workspaceId),
      eq(t.agentRuns.status, 'done'),
      inArray(t.agentRuns.agentId, agentIds),
      gte(t.agentRuns.ranAt, since),
    );
    // One row per skill id in the run's `skills_used` (none when absent / not an array).
    const usedList = sql`case when jsonb_typeof(${t.runTraces.trace} -> 'prompt_assembly' -> 'skills_used') = 'array'
      then ${t.runTraces.trace} -> 'prompt_assembly' -> 'skills_used' else '[]'::jsonb end`;

    // GROUPING SETS: per-agent totals (grouping = 1) and per-(agent, skill) counts (grouping = 0).
    const runRows = await this.db.execute<{
      agent_id: string;
      skill_id: string | null;
      is_total: number;
      runs: number;
    }>(sql`
      select ${t.agentRuns.agentId} as agent_id,
             u.skill_id as skill_id,
             grouping(u.skill_id)::int as is_total,
             count(distinct ${t.agentRuns.id})::int as runs
      from ${t.agentRuns}
      left join ${t.runTraces} on ${t.runTraces.runId} = ${t.agentRuns.id}
      left join lateral (
        select e ->> 'id' as skill_id from jsonb_array_elements(${usedList}) e
      ) u on true
      where ${runScope}
      group by grouping sets ((${t.agentRuns.agentId}), (${t.agentRuns.agentId}, u.skill_id))
    `);
    const agentRuns: SummaryUsage['agentRuns'] = [];
    const skillRuns: SummaryUsage['skillRuns'] = [];
    for (const r of runRows) {
      if (r.is_total === 1) agentRuns.push({ agentId: r.agent_id, runs: r.runs });
      else if (r.skill_id) skillRuns.push({ agentId: r.agent_id, skillId: r.skill_id, runs: r.runs });
    }

    const findingRows = await this.db.execute<{
      agent_id: string;
      skill_id: string;
      accepted: number;
      dismissed: number;
    }>(sql`
      select ${t.agentRuns.agentId} as agent_id,
             u.skill_id as skill_id,
             count(${t.findings.acceptedAt})::int as accepted,
             count(${t.findings.dismissedAt})::int as dismissed
      from ${t.findings}
      inner join ${t.reviews} on ${t.reviews.id} = ${t.findings.reviewId}
      inner join ${t.agentRuns} on ${t.agentRuns.id} = ${t.reviews.runId}
      inner join ${t.runTraces} on ${t.runTraces.runId} = ${t.agentRuns.id}
      cross join lateral (
        select distinct e ->> 'id' as skill_id from jsonb_array_elements(${usedList}) e
      ) u
      where ${runScope} and u.skill_id is not null
      group by ${t.agentRuns.agentId}, u.skill_id
    `);
    const skillFindings = findingRows.map((r) => ({
      agentId: r.agent_id,
      skillId: r.skill_id,
      accepted: r.accepted,
      dismissed: r.dismissed,
    }));
    return { links, agentRuns, skillRuns, skillFindings };
  }

  private async snapshotVersion(row: SkillRow, changeNote: string | null): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version: row.version, body: row.body, changeNote })
      .onConflictDoNothing();
  }
}
