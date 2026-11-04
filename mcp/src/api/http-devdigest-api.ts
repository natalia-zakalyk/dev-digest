import { z } from 'zod';
import type { DevDigestApi, PullRef, RepoRef, StartedRun } from '../ports.js';
import {
  ApiError,
  ApiUnreachable,
  PrNotImported,
  RepoNotImported,
  RunRateLimited,
} from '../errors.js';
import { DEFAULT_RETRY_AFTER_SECONDS, TEXT_CAPS } from '../constants.js';
import { originOf, truncateText } from '../shape/text.js';
import type {
  AgentInput,
  BlastInput,
  ConventionInput,
  FindingInput,
  ReviewInput,
  RunInput,
} from '../shape/types.js';

/**
 * Infrastructure ring: `DevDigestApi` over the DevDigest REST API.
 * Anti-corruption layer: tolerant local Zod schemas for ONLY the fields we read
 * (`.nullish()`, unknown keys ignored), mapped into domain types; transport failures
 * become the semantic errors of `errors.ts`. Raw payloads never leave this file.
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface HttpDevDigestApiOptions {
  /** API base URL, e.g. `http://localhost:3001`. */
  baseUrl: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout (spec: 10 s). */
  timeoutMs?: number;
}

// ---- Tolerant wire schemas (snake_case, exactly as the API sends them) ----

/** Parses each item on its own: the readable ones, and how many were skipped as malformed. */
function parseEach<T>(item: z.ZodType<T>, items: readonly unknown[]): { ok: T[]; skipped: number } {
  const ok: T[] = [];
  let skipped = 0;
  for (const i of items) {
    const r = item.safeParse(i);
    if (r.success) ok.push(r.data);
    else skipped += 1;
  }
  return { ok, skipped };
}

/** A list whose malformed items are skipped instead of failing the whole payload. */
const tolerantList = <T>(item: z.ZodType<T>) =>
  z.array(z.unknown()).transform((items): T[] => parseEach(item, items).ok);

const WireRepo = z.object({ id: z.string(), full_name: z.string() });
const WirePull = z.object({ id: z.string().nullish(), number: z.number(), title: z.string().nullish() });
// `system_prompt` is deliberately not declared: zod strips unknown keys.
const WireAgent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  model: z.string().nullish(),
  enabled: z.boolean().nullish(),
});
const WireStartedRun = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullish(),
});
const WireStartResponse = z.object({ runs: tolerantList(WireStartedRun).nullish() });
const WireRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  status: z.string().nullish(),
  error: z.string().nullish(),
});
const WireFinding = z.object({
  id: z.string(),
  severity: z.string(),
  title: z.string().nullish(),
  file: z.string().nullish(),
  start_line: z.number().nullish(),
  rationale: z.string().nullish(),
  suggestion: z.string().nullish(),
  confidence: z.number().nullish(),
  dismissed_at: z.string().nullish(),
});
const WireReview = z.object({
  id: z.string(),
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  run_id: z.string().nullish(),
  kind: z.string().nullish(),
  verdict: z.string().nullish(),
  score: z.number().nullish(),
  created_at: z.string().nullish(),
  // Parsed per item in `toReview`, which also counts the malformed ones so they are reported, not hidden.
  findings: z.array(z.unknown()).nullish(),
});
const WireConvention = z.object({
  rule: z.string(),
  category: z.string().nullish(),
  evidence_path: z.string().nullish(),
  evidence_line_start: z.number().nullish(),
  evidence_line_end: z.number().nullish(),
  status: z.string().nullish(),
  accepted: z.boolean().nullish(),
});
const WireConventions = z.object({ candidates: tolerantList(WireConvention).nullish() });
const WireBlast = z.object({
  changed_symbols: tolerantList(z.object({ name: z.string(), file: z.string() })).nullish(),
  downstream: tolerantList(
    z.object({
      symbol: z.string(),
      callers: tolerantList(z.object({ name: z.string(), file: z.string(), line: z.number() })).nullish(),
      endpoints_affected: z.array(z.string()).nullish(),
      crons_affected: z.array(z.string()).nullish(),
    }),
  ).nullish(),
  summary: z.string().nullish(),
  counts: z
    .object({
      symbols: z.number().nullish(),
      callers: z.number().nullish(),
      endpoints: z.number().nullish(),
      crons: z.number().nullish(),
    })
    .nullish(),
  degraded: z.boolean().nullish(),
  reason: z.string().nullish(),
});
const WireErrorBody = z.object({
  error: z.object({ message: z.string().nullish() }).nullish(),
  message: z.string().nullish(),
});

// ---- Wire -> domain mapping ----

const toFinding = (f: z.infer<typeof WireFinding>): FindingInput => ({
  id: f.id,
  severity: f.severity,
  file: f.file ?? '',
  startLine: f.start_line ?? 0,
  title: f.title ?? '',
  rationale: f.rationale ?? '',
  suggestion: f.suggestion ?? null,
  confidence: f.confidence ?? 0,
  dismissedAt: f.dismissed_at ?? null,
});

const toReview = (r: z.infer<typeof WireReview>): ReviewInput => {
  const { ok, skipped } = parseEach(WireFinding, r.findings ?? []);
  return {
    id: r.id,
    agentId: r.agent_id ?? null,
    agentName: r.agent_name ?? null,
    runId: r.run_id ?? null,
    kind: r.kind === 'summary' ? 'summary' : 'review',
    verdict: r.verdict ?? null,
    score: r.score ?? null,
    createdAt: r.created_at ?? '',
    findings: ok.map(toFinding),
    ...(skipped > 0 ? { unreadableFindings: skipped } : {}),
  };
};

const toConvention = (c: z.infer<typeof WireConvention>): ConventionInput => ({
  rule: c.rule,
  category: c.category ?? null,
  evidencePath: c.evidence_path ?? '',
  evidenceLineStart: c.evidence_line_start ?? null,
  evidenceLineEnd: c.evidence_line_end ?? null,
  // Older payloads may lack `status`; fall back to the boolean `accepted`.
  status: c.status ?? (c.accepted ? 'accepted' : 'pending'),
});

export class HttpDevDigestApi implements DevDigestApi {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: HttpDevDigestApiOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  async listAgents(): Promise<AgentInput[]> {
    const agents = await this.get('GET /agents', '/agents', tolerantList(WireAgent));
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? '',
      model: a.model ?? '',
      enabled: a.enabled ?? false,
    }));
  }

  async findRepo(fullName: string): Promise<RepoRef> {
    const repos = await this.get('GET /repos', '/repos', tolerantList(WireRepo));
    const wanted = fullName.toLowerCase();
    const hit = repos.find((r) => r.full_name.toLowerCase() === wanted);
    if (!hit) throw new RepoNotImported(fullName, repos.map((r) => r.full_name));
    return { id: hit.id, fullName: hit.full_name };
  }

  async findPull(repo: RepoRef, number: number): Promise<PullRef> {
    const pulls = await this.get(
      'GET /repos/:id/pulls',
      `/repos/${encodeURIComponent(repo.id)}/pulls`,
      tolerantList(WirePull),
    );
    const hit = pulls.find((p) => p.number === number);
    if (!hit || hit.id == null) throw new PrNotImported(repo.fullName, number);
    return { id: hit.id, number: hit.number, title: hit.title ?? '' };
  }

  async startReview(prId: string, agentId: string): Promise<StartedRun> {
    const op = 'POST /pulls/:id/review';
    const res = await this.request(op, `/pulls/${encodeURIComponent(prId)}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId }),
    }, true);
    if (res.status === 429) {
      throw new RunRateLimited(parseRetryAfter(res.headers.get('retry-after')));
    }
    const body = await this.parse(op, res, WireStartResponse);
    const runs = body.runs ?? [];
    // Fall back to the only run (the API may echo another id form), never to another agent's run.
    const run = runs.find((r) => r.agent_id === agentId) ?? (runs.length === 1 ? runs[0] : undefined);
    if (!run) throw new ApiError(res.status, op, 'response contained no run for this agent');
    return { runId: run.run_id, agentId: run.agent_id, agentName: run.agent_name ?? '' };
  }

  async listRuns(prId: string): Promise<RunInput[]> {
    const runs = await this.get(
      'GET /pulls/:id/runs',
      `/pulls/${encodeURIComponent(prId)}/runs`,
      tolerantList(WireRun),
    );
    return runs.map((r) => ({
      runId: r.run_id,
      agentId: r.agent_id ?? null,
      agentName: r.agent_name ?? null,
      status: r.status ?? null,
      error: r.error ?? null,
    }));
  }

  async listReviews(prId: string): Promise<ReviewInput[]> {
    const reviews = await this.get(
      'GET /pulls/:id/reviews',
      `/pulls/${encodeURIComponent(prId)}/reviews`,
      tolerantList(WireReview),
    );
    return reviews.map(toReview);
  }

  async listConventions(repoId: string): Promise<ConventionInput[]> {
    const body = await this.get(
      'GET /repos/:id/conventions',
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      WireConventions,
    );
    return (body.candidates ?? []).map(toConvention);
  }

  async getBlast(prId: string): Promise<BlastInput> {
    const b = await this.get('GET /pulls/:id/blast', `/pulls/${encodeURIComponent(prId)}/blast`, WireBlast);
    const changedSymbols = b.changed_symbols ?? [];
    const downstream = (b.downstream ?? []).map((d) => ({
      symbol: d.symbol,
      callers: d.callers ?? [],
      endpointsAffected: d.endpoints_affected ?? [],
      cronsAffected: d.crons_affected ?? [],
    }));
    // Counts the server did not send are derived from the lists we did get.
    const sum = (f: (d: (typeof downstream)[number]) => number) => downstream.reduce((n, d) => n + f(d), 0);
    return {
      changedSymbols,
      downstream,
      summary: b.summary ?? '',
      counts: {
        symbols: b.counts?.symbols ?? changedSymbols.length,
        callers: b.counts?.callers ?? sum((d) => d.callers.length),
        endpoints: b.counts?.endpoints ?? sum((d) => d.endpointsAffected.length),
        crons: b.counts?.crons ?? sum((d) => d.cronsAffected.length),
      },
      degraded: b.degraded ?? false,
      reason: b.reason ?? null,
    };
  }

  // ---- transport ----

  private async get<T>(op: string, path: string, schema: z.ZodType<T>): Promise<T> {
    const res = await this.request(op, path, { method: 'GET' });
    return this.parse(op, res, schema);
  }

  /**
   * Sends one request. Network failure and timeout become `ApiUnreachable`. Any non-2xx other
   * than 429 becomes `ApiError` (404/422/5xx with a short, truncated message); 429 is returned
   * to the caller when `passRateLimit` is set, because only `startReview` maps it to `RunRateLimited`.
   */
  private async request(
    op: string,
    path: string,
    init: RequestInit,
    passRateLimit = false,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}${path}`, {
        ...init,
        // A 3xx is never followed: it would re-send the request (and the POST body) to another host.
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      // Keep the original error (timeout, refused redirect, ECONNREFUSED...) as `cause` for diagnosis.
      throw new ApiUnreachable(originOf(this.base), err);
    }
    if (res.ok || (passRateLimit && res.status === 429)) return res;
    const detail = await this.errorDetail(res);
    throw new ApiError(res.status, op, detail);
  }

  private async errorDetail(res: Response): Promise<string> {
    let text = '';
    try {
      text = await res.text();
    } catch {
      return res.statusText || 'no details';
    }
    try {
      const parsed = WireErrorBody.safeParse(JSON.parse(text));
      const msg = parsed.success ? (parsed.data.error?.message ?? parsed.data.message) : null;
      if (msg) return truncateText(msg, TEXT_CAPS.apiMessage);
    } catch {
      // not JSON: fall through to a generic text
    }
    return truncateText(res.statusText || 'no details', TEXT_CAPS.apiMessage);
  }

  private async parse<T>(op: string, res: Response, schema: z.ZodType<T>): Promise<T> {
    let json: unknown;
    try {
      json = JSON.parse(await res.text());
    } catch {
      throw new ApiError(res.status, op, 'unparsable response');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError(res.status, op, 'unexpected response shape');
    return parsed.data;
  }
}

/** `Retry-After` in whole seconds; anything else (absent, HTTP-date, <= 0) falls back to 60 s. */
function parseRetryAfter(header: string | null): number {
  if (header === null) return DEFAULT_RETRY_AFTER_SECONDS;
  const n = Number(header.trim());
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : DEFAULT_RETRY_AFTER_SECONDS;
}
