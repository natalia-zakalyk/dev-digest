import { describe, it, expect } from 'vitest';
import { toSkillStats, toSkillSummary, toSkillSummaries, toSkillVersion } from '../src/modules/skills/helpers.js';

describe('toSkillStats', () => {
  it('rolls usage up into whole-percent rates and a findings total', () => {
    const stats = toSkillStats([{ id: 'a1', name: 'Security Reviewer' }], {
      runs: 7,
      runsWithSkill: 5,
      accepted: 3,
      dismissed: 1,
      byCategory: [
        { category: 'security', count: 4 },
        { category: 'bug', count: 2 },
      ],
    });
    expect(stats).toEqual({
      agents: [{ id: 'a1', name: 'Security Reviewer' }],
      pull_frequency: 71,
      accept_rate: 75,
      findings_30d: 6,
      findings_by_category: [
        { category: 'security', count: 4 },
        { category: 'bug', count: 2 },
      ],
    });
  });

  it('returns null rates (not 0) when there is nothing to divide by', () => {
    const stats = toSkillStats([], { runs: 0, runsWithSkill: 0, accepted: 0, dismissed: 0, byCategory: [] });
    expect(stats.pull_frequency).toBeNull();
    expect(stats.accept_rate).toBeNull();
    expect(stats.findings_30d).toBe(0);
  });
});

describe('toSkillVersion', () => {
  it('flags only the live version as current', () => {
    const row = { version: 4, body: 'b', createdAt: new Date('2026-05-09T00:00:00Z') };
    expect(toSkillVersion(row, 5).is_current).toBe(false);
    expect(toSkillVersion(row, 4)).toMatchObject({ version: 4, is_current: true, created_at: '2026-05-09T00:00:00.000Z' });
  });
});

describe('toSkillSummary', () => {
  it('reuses the stats definitions and drops the detail', () => {
    const usage = { runs: 4, runsWithSkill: 1, accepted: 1, dismissed: 3, byCategory: [{ category: 'bug', count: 4 }] };
    expect(toSkillSummary('s1', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], usage)).toEqual({
      skill_id: 's1',
      linked_agents: 2,
      pull_frequency: 25,
      accept_rate: 0.25,
    });
  });

  it('returns null rates and zero agents for an unused skill', () => {
    const empty = { runs: 0, runsWithSkill: 0, accepted: 0, dismissed: 0, byCategory: [] };
    expect(toSkillSummary('s2', [], empty)).toEqual({ skill_id: 's2', linked_agents: 0, pull_frequency: null, accept_rate: null });
  });
});

describe('toSkillVersion change_note', () => {
  it('maps change_note, defaulting to null', () => {
    const base = { version: 1, body: 'b', createdAt: new Date('2026-05-09T00:00:00Z') };
    expect(toSkillVersion(base, 1).change_note).toBeNull();
    expect(toSkillVersion({ ...base, changeNote: 'why' }, 1).change_note).toBe('why');
  });
});

describe('toSkillSummaries', () => {
  it('matches the per-skill stats definitions across skills sharing agents', () => {
    const out = toSkillSummaries(['s1', 's2', 's3'], {
      links: [
        { skillId: 's1', agentId: 'a' },
        { skillId: 's1', agentId: 'b' },
        { skillId: 's2', agentId: 'b' },
      ],
      agentRuns: [
        { agentId: 'a', runs: 2 },
        { agentId: 'b', runs: 2 },
        { agentId: 'c', runs: 9 },
      ],
      skillRuns: [
        { agentId: 'a', skillId: 's1', runs: 1 },
        { agentId: 'b', skillId: 's1', runs: 2 },
        { agentId: 'b', skillId: 's2', runs: 1 },
        { agentId: 'c', skillId: 's1', runs: 9 }, // c is not linked to s1: ignored
      ],
      skillFindings: [
        { agentId: 'a', skillId: 's1', accepted: 1, dismissed: 0 },
        { agentId: 'b', skillId: 's1', accepted: 0, dismissed: 2 },
        { agentId: 'c', skillId: 's1', accepted: 5, dismissed: 0 },
      ],
    });
    expect(out).toEqual([
      { skill_id: 's1', linked_agents: 2, pull_frequency: 75, accept_rate: 0.33 },
      { skill_id: 's2', linked_agents: 1, pull_frequency: 50, accept_rate: null },
      { skill_id: 's3', linked_agents: 0, pull_frequency: null, accept_rate: null },
    ]);
  });

  it('returns an empty list for no skills', () => {
    expect(toSkillSummaries([], { links: [], agentRuns: [], skillRuns: [], skillFindings: [] })).toEqual([]);
  });
});
