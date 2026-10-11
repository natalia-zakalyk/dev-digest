import type { Container } from '../../platform/container.js';
import type {
  CreateSkillBody,
  Skill,
  SkillImportPreview,
  SkillStats,
  SkillSummary,
  SkillVersion,
  UpdateSkillBody,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillStats, toSkillSummary, toSkillVersion } from './helpers.js';
import { STATS_WINDOW_DAYS } from './constants.js';
import { previewSkillImport } from './domain/importer.js';

/**
 * L02 — skills service. CRUD for the workspace's reusable, text-only skills and
 * the import preview. Linking skills to agents lives in the agents module.
 */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Body snapshots, newest first; undefined when the skill is not in the workspace. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map((r) => toSkillVersion(r, skill.version));
  }

  /** Usage over the last 30 days; undefined when the skill is not in the workspace. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const agents = await this.repo.listLinkedAgents(id);
    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const usage = await this.repo.usageSince(workspaceId, id, agents.map((a) => a.id), since);
    return toSkillStats(agents, usage);
  }

  /** Per-skill rollup for every workspace skill (30-day window, same definitions as `stats`). */
  async summary(workspaceId: string): Promise<SkillSummary[]> {
    const skills = await this.repo.list(workspaceId);
    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return Promise.all(
      skills.map(async (skill) => {
        const agents = await this.repo.listLinkedAgents(skill.id);
        const usage = await this.repo.usageSince(workspaceId, skill.id, agents.map((a) => a.id), since);
        return toSkillSummary(skill.id, agents, usage);
      }),
    );
  }

  async create(workspaceId: string, input: CreateSkillBody): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.change_note !== undefined ? { changeNote: input.change_note } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillBody): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...patch,
      ...(patch.change_note !== undefined ? { changeNote: patch.change_note } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Parse an uploaded `.md` / `.zip` into a preview. Writes nothing. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    return previewSkillImport(filename, contentBase64);
  }
}
