import { randomUUID } from 'node:crypto';
import type {
  ConventionExtractResponse,
  ConventionSkillDraft,
  ConventionsListResponse,
  ConventionCandidate,
  GitClient,
  LLMProvider,
  Provider,
  UpdateConventionBody,
} from '@devdigest/shared';
import { ConventionExtraction as ConventionExtractionSchema } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/index.js';
import { ConventionsRepository } from './repository.js';
import {
  CONFIG_FILES,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  MAX_CANDIDATES,
  MAX_SAMPLE_FILES,
} from './constants.js';
import { toConventionDto } from './helpers.js';
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT, type SampleFile } from './domain/sampling.js';
import { verifyCandidates } from './domain/verify.js';
import { buildSkillDraft } from './domain/skill-draft.js';

/** Ports the service needs — injected, so tests pass fakes (no container). */
export interface ConventionsDeps {
  repo: ConventionsRepository;
  git: GitClient;
  repoIntel: Pick<RepoIntel, 'getConventionSamples'>;
  llm(provider: Provider): Promise<LLMProvider>;
  resolveModel(workspaceId: string): Promise<{ provider: Provider; model: string }>;
}

/**
 * Conventions extractor. Spec: server/specs/conventions.md
 * sample (code) → model → verify evidence (code) → persist as `pending`.
 */
export class ConventionsService {
  constructor(private deps: ConventionsDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionsListResponse> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.deps.repo.listByRepo(workspaceId, repoId);
    const newest = rows.reduce<Date | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), null);
    return {
      candidates: rows.map(toConventionDto),
      last_scan_at: newest?.toISOString() ?? null,
      sample_files: null,
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ref = { owner: repo.owner, name: repo.name };

    // 1. Sampling — code only.
    const samplePaths = await this.deps.repoIntel.getConventionSamples(repoId, MAX_SAMPLE_FILES);
    const files = await this.readFiles(ref, [...CONFIG_FILES, ...samplePaths]);
    if (files.length === 0) {
      throw new ValidationError('No readable sample files — import and index the repository first');
    }

    // 2. Model call (cheap, per-workspace feature model).
    const choice = await this.deps.resolveModel(workspaceId);
    const llm = await this.deps.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtractionSchema,
      schemaName: EXTRACTION_SCHEMA_NAME,
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionUserPrompt(files) },
      ],
    });
    const proposed = result.data.candidates.slice(0, MAX_CANDIDATES);

    // 3. Evidence verification — code only.
    const byPath = new Map(files.map((f) => [f.path, f.content]));
    const { verified, dropped } = verifyCandidates(proposed, byPath);

    // 4. Persist (re-scan keeps earlier decisions).
    const scanId = randomUUID();
    await this.deps.repo.upsertCandidates(workspaceId, repoId, scanId, verified);
    const rows = await this.deps.repo.listByRepo(workspaceId, repoId);

    return {
      scan_id: scanId,
      candidates: rows.map(toConventionDto),
      stats: {
        proposed: proposed.length,
        verified: verified.length,
        dropped,
        sample_files: files.length,
      },
    };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionBody,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.deps.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  /** Accepted conventions → one editable skill draft. Writes nothing. */
  async skillDraft(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = (await this.deps.repo.listByIds(workspaceId, repoId, ids)).filter(
      (r) => r.status === 'accepted',
    );
    if (rows.length === 0) throw new ValidationError('Select at least one accepted convention');
    return buildSkillDraft(repo.name, rows);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** Read files from the clone; missing/unreadable/duplicate paths are skipped. */
  private async readFiles(
    ref: { owner: string; name: string },
    paths: readonly string[],
  ): Promise<SampleFile[]> {
    const out: SampleFile[] = [];
    const seen = new Set<string>();
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      try {
        out.push({ path, content: await this.deps.git.readFile(ref, path) });
      } catch {
        /* config file absent or path unsafe — skip */
      }
    }
    return out;
  }
}

/** Composition: wire the service to the container's adapters (routes stay persistence-free). */
export function createConventionsService(c: Container): ConventionsService {
  return new ConventionsService({
    repo: new ConventionsRepository(c.db),
    git: c.git,
    // Resolved lazily: tests may swap the repoIntel override after plugin load.
    repoIntel: { getConventionSamples: (repoId, n) => c.repoIntel.getConventionSamples(repoId, n) },
    llm: (provider) => c.llm(provider),
    resolveModel: (workspaceId) => resolveFeatureModel(c, workspaceId, 'conventions'),
  });
}
