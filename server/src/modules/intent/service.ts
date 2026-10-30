import type { GitClient, GitHubClient, IntentSource, LLMProvider, Provider, ReviewIntent, UrlFetcher, IntentResponse } from '@devdigest/shared';
import { IntentClassification as IntentClassificationSchema } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import {
  INTENT_MAX_RETRIES,
  INTENT_MAX_TOKENS,
  INTENT_SCHEMA_NAME,
  INTENT_TEMPERATURE,
  MAX_DOC_CHARS,
  MAX_ISSUE_CHARS,
  MAX_PRIOR_PRS,
  PROMPT_VERSION,
} from './constants.js';
import { basisFor, clampConfidence, confidenceCap, isDocumentedDescription } from './domain/confidence.js';
import { computeInputHash } from './domain/hash.js';
import { heuristicIntent } from './domain/heuristic.js';
import { buildClassifierPrompt, type ClassifierSectionMeta, type FetchedText } from './domain/prompt.js';
import { extractLinks } from './domain/sources.js';
import { renderableIntent, toIntentRecord, trimClassification } from './helpers.js';
import type { IntentRepo } from './ports.js';
import type { PrInputs, PullInfo, StoredIntent } from './types.js';

/** Ports the service needs — injected, so tests pass fakes (no container). */
export interface IntentDeps {
  repo: IntentRepo;
  git: GitClient;
  github(): Promise<GitHubClient>;
  /** Fetches linked docs on other repos/gists (GitHub content hosts only). */
  urlFetcher: UrlFetcher;
  llm(provider: Provider): Promise<LLMProvider>;
  resolveModel(workspaceId: string): Promise<{ provider: Provider; model: string }>;
  countTokens(text: string): number;
}

/** Where progress goes: a run's RunLogger (structurally) or nothing. Never receives document bodies or secrets. */
export interface IntentLog {
  info(msg: string, data?: unknown): void;
  tool(msg: string, data?: unknown): void;
  result(msg: string, data?: unknown): void;
}
const NO_LOG: IntentLog = { info: () => undefined, tool: () => undefined, result: () => undefined };

/** Metadata-only description of the classifier prompt, handed out just before the model call. */
export interface ClassifierPromptMeta {
  provider: Provider;
  model: string;
  sections: ClassifierSectionMeta[];
}

export interface DeriveOptions {
  force?: boolean;
  log?: IntentLog;
  /** Called once per real model call (not on cache hit / heuristic), before it. Sizes only, never text. */
  onClassifierPrompt?: (meta: ClassifierPromptMeta) => void;
}

export interface DeriveResult {
  stored: StoredIntent;
  cached: boolean;
  pull: PullInfo;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/**
 * Intent layer. Spec: server/specs/intent-layer.md
 * gather sources (code) → fetch linked docs → cache check → cheap model → clamp (code) → persist.
 * Never throws for model/fetch problems: it falls back to a heuristic intent (low confidence).
 */
export class IntentService {
  constructor(private deps: IntentDeps) {}

  /** Stored intent (never calls the model). `intent: null` when none was derived yet. */
  async get(workspaceId: string, prId: string): Promise<IntentResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const stored = await this.deps.repo.get(prId);
    return { intent: stored ? toIntentRecord(prId, stored, pull.headSha) : null };
  }

  /** Derive (or reuse) the intent and return the API record. Used by POST /pulls/:id/intent. */
  async deriveRecord(workspaceId: string, prId: string, opts: DeriveOptions = {}): Promise<IntentResponse> {
    const r = await this.derive(workspaceId, prId, opts);
    return { intent: toIntentRecord(prId, r.stored, r.pull.headSha) };
  }

  /** Derive (or reuse) the intent; the review executor calls this once per trigger. */
  async derive(workspaceId: string, prId: string, opts: DeriveOptions = {}): Promise<DeriveResult> {
    const log = opts.log ?? NO_LOG;
    const pull = await this.requirePull(workspaceId, prId);
    const inputs = await this.deps.repo.loadInputs(pull);
    const prior = await this.deps.repo
      .priorPrsTouching(pull.repoId, prId, inputs.files.map((f) => f.path), MAX_PRIOR_PRS)
      .catch(() => []);

    // 1. Linked sources (best effort; each failure is recorded, never thrown).
    const links = extractLinks(pull.body, { owner: pull.owner, name: pull.repoName });
    const sources: IntentSource[] = this.indirectSources(inputs, prior.length);
    const docs: FetchedText[] = [];
    let issue: FetchedText | undefined;
    for (const s of links.skipped) {
      sources.push({ kind: s.note.startsWith('issue') ? 'linked_issue' : 'linked_doc', ref: s.ref, fetched: false, note: s.note });
      log.info(`intent: link skipped — ${s.note} (${s.ref})`, { ref: s.ref, reason: s.note });
    }
    let headTried = false;
    for (const d of links.docs) {
      try {
        let text: string;
        if (d.kind === 'repo_path') {
          const repoRef = { owner: pull.owner, name: pull.repoName };
          try {
            text = await this.deps.git.readFileAt(repoRef, pull.headSha, d.path);
          } catch (e) {
            // The PR head may not be fetched locally yet: fetch it once and retry.
            if (headTried) throw e;
            headTried = true;
            await this.deps.git.fetchPullHead(repoRef, pull.number);
            text = await this.deps.git.readFileAt(repoRef, pull.headSha, d.path);
          }
        } else {
          text = decode((await this.deps.urlFetcher.fetch(d.url)).bytes);
        }
        docs.push({ ref: d.ref, text: text.slice(0, MAX_DOC_CHARS) });
        sources.push({ kind: 'linked_doc', ref: d.ref, fetched: true, note: null });
      } catch (e) {
        sources.push({ kind: 'linked_doc', ref: d.ref, fetched: false, note: errMsg(e).slice(0, 160) });
        log.info(`intent: link skipped — fetch failed (${d.ref})`, { ref: d.ref, reason: errMsg(e).slice(0, 160) });
      }
    }
    for (const n of links.issues) {
      try {
        const meta = await (await this.deps.github()).getIssue({ owner: pull.owner, name: pull.repoName }, n);
        issue = { ref: `#${n}`, text: `${meta.title}\n\n${meta.body ?? ''}`.slice(0, MAX_ISSUE_CHARS) };
        sources.push({ kind: 'linked_issue', ref: `#${n}`, fetched: true, note: null });
      } catch (e) {
        sources.push({ kind: 'linked_issue', ref: `#${n}`, fetched: false, note: errMsg(e).slice(0, 160) });
        log.info(`intent: link skipped — fetch failed (#${n})`, { ref: `#${n}`, reason: errMsg(e).slice(0, 160) });
      }
    }
    log.info(
      `intent: sources — ${sources.filter((s) => s.fetched).map((s) => (s.kind === 'linked_doc' || s.kind === 'linked_issue' ? `${s.kind} ${s.ref}` : s.kind)).join(', ')}`,
      { sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, fetched: s.fetched })) },
    );

    // 2. Deterministic ceiling + cache key.
    const documented = isDocumentedDescription(pull.body);
    const fetchedLinks = sources.filter((s) => (s.kind === 'linked_doc' || s.kind === 'linked_issue') && s.fetched).length;
    const cap = confidenceCap(documented, fetchedLinks);
    const stored = await this.deps.repo.get(prId);

    let choice: { provider: Provider; model: string } | undefined;
    let inputHash: string | undefined;
    try {
      choice = await this.deps.resolveModel(workspaceId);
      inputHash = computeInputHash({
        v: PROMPT_VERSION,
        model: `${choice.provider}/${choice.model}`,
        title: pull.title,
        body: pull.body ?? '',
        branch: pull.branch,
        base: pull.base,
        commits: inputs.commitSubjects,
        files: inputs.files.map((f) => f.path),
        docs: docs.map((d) => [d.ref, d.text]),
        issue: issue ? [issue.ref, issue.text] : null,
      });
    } catch (e) {
      log.info(`intent: model unavailable — ${errMsg(e)}; using heuristic fallback (low confidence)`);
    }

    if (choice && inputHash && stored && !opts.force && stored.method === 'llm' && stored.inputHash === inputHash) {
      const fresh = stored.headSha === pull.headSha ? stored : { ...stored, headSha: pull.headSha };
      if (fresh !== stored) await this.deps.repo.upsert(prId, fresh);
      log.info(`intent: cache hit (input unchanged, derived ${stored.generatedAt.toISOString()})`, { cached: true });
      return { stored: fresh, cached: true, pull };
    }

    // 3. Model call (cheap, per-workspace feature model) → clamp → persist.
    if (choice && inputHash) {
      try {
        const llm = await this.deps.llm(choice.provider);
        log.tool(`intent: classifying with ${choice.provider}/${choice.model}`, { provider: choice.provider, model: choice.model });
        const prompt = buildClassifierPrompt({ inputs, issue, docs, prior }, this.deps.countTokens);
        try {
          opts.onClassifierPrompt?.({ provider: choice.provider, model: choice.model, sections: prompt.sections });
        } catch {
          // A logging callback must never fail the classification.
        }
        const res = await llm.completeStructured({
          model: choice.model,
          schema: IntentClassificationSchema,
          schemaName: INTENT_SCHEMA_NAME,
          temperature: INTENT_TEMPERATURE,
          maxTokens: INTENT_MAX_TOKENS,
          maxRetries: INTENT_MAX_RETRIES,
          messages: prompt.messages,
        });
        const c = trimClassification(res.data);
        const record: StoredIntent = {
          intent: c.intent,
          inScope: c.in_scope,
          outOfScope: c.out_of_scope,
          riskAreas: c.risk_areas,
          confidence: clampConfidence(c.confidence, cap),
          basis: basisFor(cap),
          method: 'llm',
          sources,
          headSha: pull.headSha,
          inputHash,
          provider: choice.provider,
          model: choice.model,
          tokensIn: res.tokensIn,
          tokensOut: res.tokensOut,
          costUsd: res.costUsd ?? null,
          generatedAt: new Date(),
        };
        await this.deps.repo.upsert(prId, record);
        log.result(
          `Intent ready — confidence=${record.confidence} (${record.basis}), ${record.inScope.length} in scope, ` +
            `${record.outOfScope.length} out of scope, ${record.riskAreas.length} risk areas · ` +
            `${record.tokensIn}→${record.tokensOut} tokens${record.costUsd != null ? ` · $${record.costUsd.toFixed(4)}` : ''}`,
          { confidence: record.confidence, tokens_in: record.tokensIn, tokens_out: record.tokensOut, cost_usd: record.costUsd },
        );
        return { stored: record, cached: false, pull };
      } catch (e) {
        log.info(`intent: model call failed — ${errMsg(e)}; using heuristic fallback (low confidence)`);
      }
    }

    // 4. Fallback: heuristic, always low, stored WITHOUT an input hash so the next run retries the model.
    const h = heuristicIntent(inputs);
    const record: StoredIntent = {
      intent: h.intent,
      inScope: h.in_scope,
      outOfScope: h.out_of_scope,
      riskAreas: h.risk_areas,
      confidence: 'low',
      basis: 'inferred',
      method: 'heuristic',
      sources,
      headSha: pull.headSha,
      inputHash: null,
      provider: null,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      generatedAt: new Date(),
    };
    await this.deps.repo.upsert(prId, record);
    log.result('Intent ready — heuristic fallback (low confidence)', { confidence: 'low' });
    return { stored: record, cached: false, pull };
  }

  /** The reviewer-core view of a derive result. */
  toReviewIntent(r: DeriveResult): ReviewIntent {
    return renderableIntent(r.stored);
  }

  private indirectSources(inputs: PrInputs, priorCount: number): IntentSource[] {
    const out: IntentSource[] = [{ kind: 'title', ref: 'title', fetched: true, note: null }];
    if (inputs.pull.body && inputs.pull.body.trim()) out.push({ kind: 'description', ref: 'description', fetched: true, note: null });
    out.push({ kind: 'branch', ref: inputs.pull.branch, fetched: true, note: null });
    if (inputs.commitSubjects.length > 0) out.push({ kind: 'commits', ref: `${inputs.commitSubjects.length} commit(s)`, fetched: true, note: null });
    if (inputs.files.length > 0) out.push({ kind: 'file_paths', ref: `${inputs.files.length} file(s)`, fetched: true, note: null });
    out.push({ kind: 'diff_stats', ref: `+${inputs.pull.additions} −${inputs.pull.deletions}`, fetched: true, note: null });
    if (priorCount > 0) out.push({ kind: 'prior_prs', ref: `${priorCount} PR(s)`, fetched: true, note: null });
    return out;
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullInfo> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }
}
