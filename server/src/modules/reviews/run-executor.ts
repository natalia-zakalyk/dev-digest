import { createHash } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import type { Provider, Review, ReviewIntent, RunIntentInfo, RunTrace, SkillUsed, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers, type PromptMeasure, type PromptAssembledEvent } from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import { buildPromptLogRecord, summarizePromptLog } from '../../platform/prompt-log.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import { detectInjection, formatSkillBlock } from '../skills/index.js';
import { createIntentService, renderableIntent, type ClassifierPromptMeta } from '../intent/index.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
/** Token/cost totals reported by the engine's `onUsage` (running, per chunk). */
type RunUsage = { tokensIn: number; tokensOut: number; costUsd: number | null };

/** Result of the shared intent step: what the reviewers see + what the trace records. */
type DerivedIntent = { review: ReviewIntent; info: RunIntentInfo };

export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
    opts: { correlationId?: string } = {},
  ): Promise<void> {
    const correlationId = opts.correlationId ?? 'unknown';
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id, correlationId },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: null,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Shared pre-work, once per trigger: derive the PR's intent (cheap model). Best-effort —
    // any error means "no intent", never a failed run.
    const derived = await this.deriveIntent(workspaceId, pull, runLog, correlationId, jobs.map((j) => j.runId));

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, correlationId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(workspaceId, pull, repo, diff, agent, runId, runLog, correlationId, derived);
        logger?.info(
          {
            runId,
            correlationId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, correlationId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /**
   * Derive the PR intent once for all queued runs (fan-out logger → every Live Log shows it).
   * Never throws: on any error it logs and returns undefined so the reviews run without intent.
   */
  private async deriveIntent(
    workspaceId: string,
    pull: PullRow,
    runLog: RunLogger,
    correlationId: string,
    runIds: string[],
  ): Promise<DerivedIntent | undefined> {
    try {
      const service = createIntentService(this.container);
      const r = await runLog.step(
        'Deriving PR intent',
        () =>
          service.derive(workspaceId, pull.id, {
            log: runLog,
            onClassifierPrompt: (meta) => this.logClassifierPrompt(runLog, pull, correlationId, runIds, meta),
          }),
        { kind: 'tool' },
      );
      const s = r.stored;
      return {
        review: renderableIntent(s),
        info: {
          method: s.method,
          confidence: s.confidence,
          cached: r.cached,
          provider: s.provider,
          model: s.model,
          // A cache hit cost nothing this run.
          tokens_in: r.cached ? 0 : s.tokensIn,
          tokens_out: r.cached ? 0 : s.tokensOut,
          cost_usd: r.cached ? null : s.costUsd,
        },
      };
    } catch (err) {
      runLog.info(`intent: unavailable — ${(err as Error).message}; reviewing without it`);
      return undefined;
    }
  }

  /**
   * Pure measuring function injected into reviewer-core: token estimate, plus a short
   * content hash only when hashes are effective (local development, verbose mode).
   */
  private promptMeasure(): PromptMeasure {
    const hashes = this.container.config.promptLog.hashes;
    return (text) => {
      try {
        return {
          tokens: this.container.tokenizer.count(text),
          ...(hashes ? { hash: createHash('sha256').update(text).digest('hex').slice(0, 12) } : {}),
        };
      } catch {
        return { tokens: null }; // logging aid only: never let it fail the review
      }
    };
  }

  /**
   * Prompt-assembly log for one review call (before the LLM call). The full record goes to
   * pino stdout only (`ops`); the Live Log gets a counts-only summary line. Never throws.
   */
  private logReviewPrompt(
    runLog: RunLogger,
    pull: PullRow,
    agent: AgentRow,
    runId: string,
    correlationId: string,
    skillsUsed: SkillUsed[],
    e: PromptAssembledEvent,
  ): void {
    try {
      const { verbose, hashes } = this.container.config.promptLog;
      const record = buildPromptLogRecord({
        call: 'review',
        correlationId,
        runId,
        agentId: agent.id,
        prId: pull.id,
        provider: agent.provider,
        model: agent.model,
        mode: e.mode,
        chunk: { index: e.chunkIndex, count: e.chunkCount, label: e.label },
        sections: e.sections,
        verbose,
        hashes,
        itemRefs: { skills: skillsUsed.map((u) => `${u.name}@v${u.version} (${u.id})`) },
      });
      runLog.ops('prompt assembled', record);
      runLog.info(summarizePromptLog(record));
    } catch {
      runLog.ops('prompt log failed', { event: 'prompt.log_failed', runId });
    }
  }

  /** Prompt-assembly log for the intent classifier call (stdout only; shared by every run of the trigger). */
  private logClassifierPrompt(
    runLog: RunLogger,
    pull: PullRow,
    correlationId: string,
    runIds: string[],
    meta: ClassifierPromptMeta,
  ): void {
    try {
      const { verbose, hashes } = this.container.config.promptLog;
      const record = buildPromptLogRecord({
        call: 'intent_classifier',
        correlationId,
        runId: null,
        runIds,
        agentId: null,
        prId: pull.id,
        provider: meta.provider,
        model: meta.model,
        mode: null,
        chunk: { index: 0, count: 1, label: null },
        sections: meta.sections,
        verbose,
        hashes,
      });
      runLog.ops('prompt assembled', record);
    } catch {
      runLog.ops('prompt log failed', { event: 'prompt.log_failed', call: 'intent_classifier' });
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    correlationId: string,
    derived?: DerivedIntent,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });
    // Running usage totals from the engine (per chunk) — persisted as PARTIAL
    // usage/cost if a later chunk fails or the run is cancelled.
    let usage: RunUsage = { tokensIn: 0, tokensOut: 0, costUsd: null };

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.container.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // L02 — the agent's skills: linked AND globally enabled, in link order.
      const skills = await this.buildSkills(agent.id, runLog);

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // L02 — one block per skill; assemblePrompt omits the section when empty.
        ...(skills.blocks.length > 0 ? { skills: skills.blocks } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Derived PR intent (untrusted; wrapped by assemblePrompt). Omitted when derivation failed.
        ...(derived ? { intent: derived.review } : {}),
        task,
        measure: this.promptMeasure(),
        onPromptAssembled: (e) => this.logReviewPrompt(runLog, pull, agent, runId, correlationId, skills.used, e),
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        onUsage: (u) => {
          usage = u;
        },
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      const keptFindings = outcome.review.findings;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Persist review + findings + run row in ONE transaction ------------
      // Either the review, its findings, the PR's reviewed-SHA and the `done`
      // run row all land, or none do (a crash mid-way used to leave a review
      // with no completed run, or a `done` run with no review). A failure here
      // rolls back and falls into the catch below, which marks the run failed.
      const durationMs = Date.now() - start;
      const { review, findingRows } = await this.repo.transaction(async (tx) => {
        const review = await tx.insertReview({
          workspaceId,
          prId: pull.id,
          agentId: agent.id,
          runId,
          kind: 'review',
          verdict: outcome.review.verdict,
          summary: outcome.review.summary,
          score: outcome.review.score,
          model: agent.model,
        });
        const findingRows = await tx.insertFindings(review.id, keptFindings);
        // Mark the commit this review ran against so the PR list can tell
        // reviewed / needs-review (head moved) / stale apart.
        await tx.markReviewed(pull.id, pull.headSha);
        // ---- Observability: agent_runs row (the trace doc is written below) --
        await tx.completeAgentRun(runId, {
          status: 'done',
          durationMs,
          tokensIn,
          tokensOut,
          costUsd,
          findingsCount: findingRows.length,
          grounding,
          score: outcome.review.score,
          blockers,
          error: null,
        });
        return { review, findingRows };
      });
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        ...(derived ? { intent: derived.info } : {}),
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: {
          ...outcome.assembly,
          skills_used: skills.used,
          skills_tokens: outcome.assembly.skills ? this.container.tokenizer.count(outcome.assembly.skills) : 0,
        },
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: [],
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      // Deliberately OUTSIDE the transaction and best-effort: the trace is a
      // large debug document. A failed trace write must not roll back (or, via
      // the catch below, flip to `failed`) an already-committed review.
      await this.repo.saveRunTrace(runId, trace).catch((err: unknown) => {
        runLog.error(`Run trace persist failed (review saved): ${(err as Error).message}`);
      });
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          // Partial cost of the chunks that completed before the failure/cancel;
          // stays null (not 0) when no LLM call finished — "no data", not "free".
          costUsd: usage.costUsd,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start, usage, derived?.info))
        .catch(() => undefined);
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * L02 — resolve the agent's skills into prompt blocks. Only linked skills that
   * are globally enabled reach the prompt (`skills.enabled` is the master
   * switch), in `agent_skills.order`. Logged as its own line so the Live log
   * shows which skills went in and roughly what they cost in tokens.
   */
  private async buildSkills(
    agentId: string,
    runLog: RunLogger,
  ): Promise<{ blocks: string[]; used: SkillUsed[] }> {
    const enabled = await this.agents.enabledSkillsForAgent(agentId);
    // Defense in depth: a skill flagged by the injection gate never reaches a prompt, even if it was
    // linked before it became flagged (the flag is derived from the current text).
    const blocked = enabled.filter((l) => detectInjection(l.skill).detected);
    const linked = enabled.filter((l) => !blocked.includes(l));
    if (blocked.length > 0) {
      runLog.info(`skills: skipped ${blocked.length} blocked (injection detected): ${blocked.map((b) => b.skill.name).join(', ')}`);
    }
    if (linked.length === 0) {
      runLog.info('skills: none attached');
      return { blocks: [], used: [] };
    }
    const blocks = linked.map((l) => formatSkillBlock(l.skill));
    const used = linked.map((l) => ({ id: l.skill.id, name: l.skill.name, version: l.skill.version }));
    const tokens = this.container.tokenizer.count(blocks.join('\n\n'));
    runLog.info(
      `skills: ${linked.length} attached (${used.map((u) => u.name).join(', ')}) · ~${tokens} tokens`,
      { skills: used, tokens },
    );
    return { blocks, used };
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
    usage: RunUsage = { tokensIn: 0, tokensOut: 0, costUsd: null },
    intent?: RunIntentInfo,
  ): RunTrace {
    return {
      ...(intent ? { intent } : {}),
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: {
        duration_ms: durationMs,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        findings: 0,
        grounding,
      },
      prompt_assembly: { system: agent.systemPrompt, skills: null, skills_used: null, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
