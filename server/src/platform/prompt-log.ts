import { redactCredentials } from './redact.js';

/**
 * Prompt-assembly log record: ONE metadata-only record per prompt sent to a model.
 * Spec: server/specs/prompt-assembly-logging.md
 *
 * Pure and allow-list based: the record is a fresh object literal built field by field
 * from typed scalars, never by spreading caller objects. The inputs never contain prompt
 * text (the reviewer-core `PromptSectionMeta` and the intent classifier meta carry sizes
 * and flags only), so this file cannot leak what it never receives. The only strings that
 * come from outside (model id, refs, labels, ids) go through the sanitizers below.
 */

export type PromptLogCall = 'review' | 'intent_classifier';

/** Closed set of section names: review prompt sections + intent classifier sections. */
export type PromptLogSectionName =
  | 'system'
  | 'task'
  | 'pr_description'
  | 'pr_intent'
  | 'skills'
  | 'memory'
  | 'repo_map'
  | 'specs'
  | 'callers'
  | 'diff'
  | 'header'
  | 'pr_title'
  | 'linked_issue'
  | 'linked_doc'
  | 'commits'
  | 'changed_files'
  | 'prior_prs';

export type PromptLogSectionSource =
  | 'agent_config'
  | 'engine'
  | 'pr_author'
  | 'intent_llm'
  | 'skills_db'
  | 'memory'
  | 'repo_intel'
  | 'project_specs'
  | 'git_diff'
  | 'pr_metadata'
  | 'github_issue'
  | 'linked_doc'
  | 'git_log'
  | 'db';

/** One item of a multi-item section, as reported by the producer (sizes only; `ref` is an identifier). */
export interface PromptLogItemInput {
  index: number;
  chars: number;
  tokens: number | null;
  hash?: string;
  ref?: string | null;
}

/** One section as reported by the producer (reviewer-core or the intent classifier). */
export interface PromptLogSectionInput {
  name: PromptLogSectionName;
  source: PromptLogSectionSource;
  trust: 'trusted' | 'untrusted';
  wrapped: boolean;
  chars: number;
  tokens: number | null;
  items: number;
  truncated: boolean;
  dropped?: boolean;
  itemsMeta: PromptLogItemInput[];
}

export interface PromptLogSectionRecord {
  name: PromptLogSectionName;
  source: PromptLogSectionSource;
  trust: 'trusted' | 'untrusted';
  wrapped: boolean;
  chars: number;
  tokens: number | null;
  items: number;
  truncated: boolean;
  dropped?: boolean;
}

export interface PromptLogItemRecord {
  section: PromptLogSectionName;
  index: number;
  ref: string | null;
  chars: number;
  tokens: number | null;
  sha256_12?: string;
}

export interface PromptLogRecord {
  event: 'prompt.assembled';
  schema_version: 1;
  call: PromptLogCall;
  correlation_id: string;
  run_id: string | null;
  run_ids: string[] | null;
  agent_id: string | null;
  pr_id: string;
  provider: string;
  model: string;
  mode: 'single-pass' | 'map-reduce' | null;
  chunk: { index: number; count: number; label: string | null };
  sections: PromptLogSectionRecord[];
  totals: { chars: number; tokens: number | null; sections: number };
  verbose: boolean;
  items?: PromptLogItemRecord[];
  items_truncated?: boolean;
}

export interface PromptLogInput {
  call: PromptLogCall;
  correlationId: string;
  runId: string | null;
  runIds?: string[] | null;
  agentId: string | null;
  prId: string;
  provider: string;
  model: string;
  mode: 'single-pass' | 'map-reduce' | null;
  chunk: { index: number; count: number; label: string | null };
  sections: PromptLogSectionInput[];
  /** Effective verbose mode (already gated by config). */
  verbose: boolean;
  /** Effective hashes flag (already gated by config); only honored together with `verbose`. */
  hashes?: boolean;
  /** Identifier refs per section name, by item index (e.g. `name@v3` for skills). Never content. */
  itemRefs?: Partial<Record<PromptLogSectionName, string[]>>;
}

export const MAX_PROMPT_LOG_BYTES = 16_384;
const MAX_REF_CHARS = 200;
const INVALID = '[invalid]';
const REDACTED = '[redacted]';

/** Defense in depth: a ref/label matching any of these is replaced entirely. */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-or-[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[bpsa]-[0-9A-Za-z-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /npm_[A-Za-z0-9]{36}/,
];

const MODEL_ID = /^[A-Za-z0-9._:/@-]{1,120}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

const num = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const numOrNull = (n: number | null): number | null => (n === null ? null : num(n));

/** Free-text label (e.g. a file path): scrub credentials, control chars, length; secret-looking → redacted. */
export function safeText(s: string): string {
  const cleaned = redactCredentials(s).replace(CONTROL_CHARS, ' ').slice(0, MAX_REF_CHARS);
  return SECRET_PATTERNS.some((p) => p.test(cleaned)) ? REDACTED : cleaned;
}

/** Reference to a document/skill/spec: like `safeText`, plus `?query` and `#fragment` are dropped. */
export function safeRef(s: string): string {
  // Strip the query/fragment first, but keep a leading `#123` (issue ref) intact.
  const body = s.startsWith('#') ? s : s.replace(/[?#].*$/s, '');
  return safeText(body);
}

export function safeModel(s: string): string {
  return MODEL_ID.test(s) && !SECRET_PATTERNS.some((p) => p.test(s)) ? s : INVALID;
}

const safeId = (s: string): string => (SAFE_ID.test(s) ? s : INVALID);

export function buildPromptLogRecord(input: PromptLogInput): PromptLogRecord {
  const showHash = input.verbose && input.hashes === true;
  const sections: PromptLogSectionRecord[] = input.sections.map((s) => ({
    name: s.name,
    source: s.source,
    trust: s.trust,
    wrapped: s.wrapped === true,
    chars: num(s.chars),
    tokens: numOrNull(s.tokens),
    items: num(s.items),
    truncated: s.truncated === true,
    ...(s.dropped !== undefined ? { dropped: s.dropped === true } : {}),
  }));

  const live = input.sections.filter((s) => s.dropped !== true);
  const tokenParts = live.map((s) => s.tokens);
  const totals = {
    chars: live.reduce((n, s) => n + num(s.chars), 0),
    tokens: tokenParts.every((t) => t !== null) ? tokenParts.reduce<number>((n, t) => n + num(t as number), 0) : null,
    sections: live.length,
  };

  const record: PromptLogRecord = {
    event: 'prompt.assembled',
    schema_version: 1,
    call: input.call,
    correlation_id: safeId(input.correlationId),
    run_id: input.runId === null ? null : safeId(input.runId),
    run_ids: input.runIds ? input.runIds.map(safeId) : null,
    agent_id: input.agentId === null ? null : safeId(input.agentId),
    pr_id: safeId(input.prId),
    provider: safeId(input.provider),
    model: safeModel(input.model),
    mode: input.mode,
    chunk: {
      index: num(input.chunk.index),
      count: num(input.chunk.count),
      label: input.chunk.label === null ? null : safeText(input.chunk.label),
    },
    sections,
    totals,
    verbose: input.verbose,
  };
  if (!input.verbose) return record;

  const items: PromptLogItemRecord[] = [];
  for (const s of input.sections) {
    for (const it of s.itemsMeta) {
      const raw = it.ref ?? input.itemRefs?.[s.name]?.[it.index] ?? (s.name === 'specs' ? `spec-${it.index}` : null);
      items.push({
        section: s.name,
        index: num(it.index),
        ref: raw === null ? null : safeRef(raw),
        chars: num(it.chars),
        tokens: numOrNull(it.tokens),
        ...(showHash && it.hash && /^[0-9a-f]{12}$/.test(it.hash) ? { sha256_12: it.hash } : {}),
      });
    }
  }
  record.items = items;
  if (JSON.stringify(record).length > MAX_PROMPT_LOG_BYTES) {
    delete record.items;
    record.items_truncated = true;
  }
  return record;
}

const fmtTokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** One-line, counts-only summary for the Live Log (safe for SSE and run_traces.log). */
export function summarizePromptLog(record: PromptLogRecord): string {
  const diff = record.sections.find((s) => s.name === 'diff');
  const total = record.totals.tokens;
  const diffPart = diff && diff.tokens !== null ? ` (diff ~${fmtTokens(diff.tokens)})` : '';
  const tokenPart = total !== null ? ` · ~${fmtTokens(total)} tokens${diffPart}` : ` · ${record.totals.chars} chars`;
  return `prompt: ${record.totals.sections} sections${tokenPart}`;
}
