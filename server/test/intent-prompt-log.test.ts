import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockGitClient, MockLLMProvider, MockUrlFetcher } from '../src/adapters/mocks.js';
import {
  buildClassifierMessages,
  buildClassifierPrompt,
  CLASSIFIER_SYSTEM_PROMPT,
  type ClassifierInput,
} from '../src/modules/intent/domain/prompt.js';
import { IntentService, type ClassifierPromptMeta, type IntentDeps } from '../src/modules/intent/service.js';
import type { IntentRepo } from '../src/modules/intent/ports.js';
import type { PullInfo, StoredIntent } from '../src/modules/intent/types.js';
import { wrapUntrusted } from '@devdigest/reviewer-core/prompt';
import { buildPromptLogRecord } from '../src/platform/prompt-log.js';

/**
 * Intent classifier prompt metadata (server/specs/prompt-assembly-logging.md).
 * Sections carry sizes/flags/refs only; messages are exactly what the model receives.
 */

const S = {
  title: 'SENTINEL_PR_TITLE_90de',
  body: 'SENTINEL_PR_BODY_c91e '.repeat(8),
  issue: 'SENTINEL_ISSUE_BODY_e2d1',
  doc: 'SENTINEL_DOC_BODY_31fa',
  commit: 'SENTINEL_COMMIT_SUBJECT_0b7c',
  prior: 'SENTINEL_PRIOR_TITLE_6a41',
} as const;

const countTokens = (t: string) => Math.ceil(t.length / 4);

function pull(over: Partial<PullInfo> = {}): PullInfo {
  return {
    id: 'pr-1', repoId: 'repo-1', owner: 'o', repoName: 'r', number: 7, title: S.title, body: S.body,
    branch: 'feat/x', base: 'main', headSha: 'sha1', additions: 10, deletions: 2, filesCount: 2, ...over,
  };
}

function input(over: Partial<ClassifierInput> = {}): ClassifierInput {
  const p = pull();
  return {
    inputs: {
      pull: p,
      files: [{ path: 'src/a.ts', additions: 5, deletions: 1 }, { path: 'src/b.ts', additions: 5, deletions: 1 }],
      commitSubjects: [S.commit],
    },
    issue: { ref: '#12', text: S.issue },
    docs: [{ ref: 'docs/spec.md', text: S.doc }],
    prior: [{ number: 3, title: S.prior, overlap: 1 }],
    ...over,
  };
}

describe('buildClassifierPrompt', () => {
  it('messages are exactly buildClassifierMessages (system + header + wrapped blocks in priority order)', () => {
    const i = input();
    const { messages } = buildClassifierPrompt(i, countTokens);
    expect(messages).toEqual(buildClassifierMessages(i, countTokens));
    expect(messages[0]).toEqual({ role: 'system', content: CLASSIFIER_SYSTEM_PROMPT });
    const header = 'PR #7\nStats: 2 file(s), +10 −2';
    expect(messages[1]!.content).toBe(
      [
        header,
        wrapUntrusted('pr-title', `${S.title}\nBranch: feat/x → main`),
        wrapUntrusted('pr-description', S.body.trim()),
        wrapUntrusted('linked-issue #12', S.issue),
        wrapUntrusted('linked-doc-0 docs/spec.md', S.doc),
        wrapUntrusted('commits', `- ${S.commit}`),
        wrapUntrusted('changed-files', 'src/a.ts (+5 −1)\nsrc/b.ts (+5 −1)'),
        wrapUntrusted('prior-prs', `#3 ${S.prior} (1 shared file(s))`),
      ].join('\n\n'),
    );
  });

  it('section meta lists every present section with sizes and no content', () => {
    const { sections } = buildClassifierPrompt(input(), countTokens);
    expect(sections.map((s) => s.name)).toEqual([
      'system', 'header', 'pr_title', 'pr_description', 'linked_issue', 'linked_doc', 'commits', 'changed_files', 'prior_prs',
    ]);
    expect(sections.every((s) => !s.dropped)).toBe(true);
    const sys = sections[0]!;
    expect(sys).toMatchObject({ chars: CLASSIFIER_SYSTEM_PROMPT.length, trust: 'trusted', wrapped: false });
    expect(sections.find((s) => s.name === 'linked_doc')).toMatchObject({
      items: 1, trust: 'untrusted', wrapped: true,
      itemsMeta: [{ index: 0, ref: 'docs/spec.md' }],
    });
    const json = JSON.stringify(sections);
    for (const v of Object.values(S)) expect(json).not.toContain(v.trim());
    expect(json).not.toContain('SENTINEL');
  });

  it('aggregates multiple docs into one section with per-doc items and truncation flag', () => {
    const big = 'x'.repeat(9000);
    const { sections } = buildClassifierPrompt(
      input({ docs: [{ ref: 'a.md', text: 'small' }, { ref: 'b.md', text: big }] }),
      countTokens,
    );
    const docs = sections.find((s) => s.name === 'linked_doc')!;
    expect(docs.items).toBe(2);
    expect(docs.truncated).toBe(true);
    expect(docs.itemsMeta.map((m) => m.ref)).toEqual(['a.md', 'b.md']);
  });

  it('under a tiny budget the lowest-priority sections are dropped and flagged, the messages match', () => {
    const i = input();
    // Smaller than header + title: everything but the highest-priority block (the PR title) goes.
    const { messages, sections } = buildClassifierPrompt(i, countTokens, 1);
    const dropped = Object.fromEntries(sections.map((s) => [s.name, s.dropped]));
    expect(dropped).toEqual({
      system: false, header: false, pr_title: false, pr_description: true,
      linked_issue: true, linked_doc: true, commits: true, changed_files: true, prior_prs: true,
    });
    expect(messages).toEqual(buildClassifierMessages(i, countTokens, 1));
    const user = messages[1]!.content;
    expect(user).toContain('pr-title');
    for (const gone of ['pr-description', 'linked-issue', 'linked-doc', 'commits', 'changed-files', 'prior-prs']) {
      expect(user).not.toContain(gone);
    }
  });

  it('drops in priority order: prior PRs first, then files, commits', () => {
    const full = buildClassifierPrompt(input(), countTokens);
    const total = full.sections.filter((s) => !s.dropped && s.name !== 'system').reduce((n, s) => n + s.tokens, 0);
    const { sections } = buildClassifierPrompt(input(), countTokens, total - 1);
    expect(sections.filter((s) => s.dropped).map((s) => s.name)).toEqual(['prior_prs']);
  });

  it('refs go through the log builder sanitised (userinfo, query, fragment, secrets)', () => {
    const hostile = 'https://user:SENTINEL_USERINFO_pw12@host.example/a.md?token=SENTINEL_QUERY_tok9#SENTINEL_FRAGMENT_77ab';
    const { sections } = buildClassifierPrompt(
      input({ docs: [{ ref: hostile, text: S.doc }, { ref: 'sk-or-v1-SENTINELSECRET0000000000000000', text: S.doc }] }),
      countTokens,
    );
    for (const verbose of [false, true]) {
      const rec = buildPromptLogRecord({
        call: 'intent_classifier', correlationId: 'c1', runId: null, runIds: ['r1'], agentId: null, prId: 'pr-1',
        provider: 'openrouter', model: 'x/y', mode: null, chunk: { index: 0, count: 1, label: null },
        sections: sections.map((s) => ({ ...s })), verbose,
      });
      const json = JSON.stringify(rec);
      expect(json).not.toContain('SENTINEL');
      for (const v of Object.values(S)) expect(json).not.toContain(v.trim());
    }
    const rec = buildPromptLogRecord({
      call: 'intent_classifier', correlationId: 'c1', runId: null, agentId: null, prId: 'pr-1',
      provider: 'openrouter', model: 'x/y', mode: null, chunk: { index: 0, count: 1, label: null },
      sections: sections.map((s) => ({ ...s })), verbose: true,
    });
    expect(rec.items!.map((i) => i.ref)).toEqual(['#12', 'https://***@host.example/a.md', '[redacted]']);
  });
});

// ---- IntentService.derive: the onClassifierPrompt hook ----

function memoryRepo(p: PullInfo = pull()) {
  let stored: StoredIntent | undefined;
  const repo: IntentRepo = {
    getPull: async () => p,
    get: async () => stored,
    upsert: async (_id, s) => {
      stored = s;
    },
    loadInputs: async (pl) => ({ pull: pl, files: [{ path: 'src/a.ts', additions: 1, deletions: 0 }], commitSubjects: [S.commit] }),
    priorPrsTouching: async () => [],
  };
  return { repo, stored: () => stored };
}

const FIXTURE = { intent: 'Adds rate limiting.', in_scope: ['api'], out_of_scope: [], risk_areas: ['auth'], confidence: 'high' };

function service(opts: { llm?: LLMProvider; resolveModel?: IntentDeps['resolveModel']; repo?: IntentRepo } = {}) {
  const mem = memoryRepo();
  const order: string[] = [];
  const mock = new MockLLMProvider('openai', { structured: FIXTURE });
  const llm: LLMProvider =
    opts.llm ??
    ({
      id: mock.id,
      listModels: () => mock.listModels(),
      complete: (r) => mock.complete(r),
      completeStructured: async <T>(r: StructuredRequest<T>): Promise<StructuredResult<T>> => {
        order.push('llm');
        return mock.completeStructured(r);
      },
    } as LLMProvider);
  const svc = new IntentService({
    repo: opts.repo ?? mem.repo,
    git: new MockGitClient(),
    github: async () => {
      throw new Error('github must not be called');
    },
    urlFetcher: new MockUrlFetcher(),
    llm: async () => llm,
    resolveModel: opts.resolveModel ?? (async () => ({ provider: 'openrouter', model: 'x/y' })),
    countTokens,
  });
  return { svc, order, mem, mock };
}

describe('IntentService.derive — onClassifierPrompt', () => {
  it('is called once, BEFORE the model call, with metadata only', async () => {
    const { svc, order } = service();
    const seen: ClassifierPromptMeta[] = [];
    const r = await svc.derive('w1', 'pr-1', {
      onClassifierPrompt: (m) => {
        order.push('callback');
        seen.push(m);
      },
    });
    expect(order).toEqual(['callback', 'llm']);
    expect(r.stored.method).toBe('llm');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'openrouter', model: 'x/y' });
    expect(seen[0]!.sections.map((s) => s.name)).toEqual(['system', 'header', 'pr_title', 'pr_description', 'commits', 'changed_files']);
    expect(JSON.stringify(seen[0])).not.toContain('SENTINEL');
  });

  it('an exception inside the callback does not fail the derive nor skip the model call', async () => {
    const { svc, order, mem } = service();
    const r = await svc.derive('w1', 'pr-1', {
      onClassifierPrompt: () => {
        order.push('callback');
        throw new Error('logging blew up');
      },
    });
    expect(order).toEqual(['callback', 'llm']);
    expect(r.stored.method).toBe('llm');
    expect(r.stored.intent).toBe('Adds rate limiting.');
    expect(mem.stored()?.method).toBe('llm');
  });

  it('works without a callback (manual POST /intent path)', async () => {
    const { svc } = service();
    await expect(svc.derive('w1', 'pr-1')).resolves.toMatchObject({ cached: false, stored: { method: 'llm' } });
  });

  it('the messages sent to the model equal buildClassifierMessages for the same inputs', async () => {
    const { svc, mock, mem } = service();
    await svc.derive('w1', 'pr-1');
    const req = mock.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    const p = pull();
    const expected = buildClassifierMessages(
      { inputs: await mem.repo.loadInputs(p), issue: undefined, docs: [], prior: [] },
      countTokens,
    );
    expect(req.messages).toEqual(expected);
  });

  it('is not called on a cache hit', async () => {
    const { svc } = service();
    await svc.derive('w1', 'pr-1');
    const cb = vi.fn();
    const r = await svc.derive('w1', 'pr-1', { onClassifierPrompt: cb });
    expect(r.cached).toBe(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('is not called when no model can be resolved (heuristic fallback)', async () => {
    const { svc } = service({
      resolveModel: async () => {
        throw new Error('no key');
      },
    });
    const cb = vi.fn();
    const r = await svc.derive('w1', 'pr-1', { onClassifierPrompt: cb });
    expect(r.stored.method).toBe('heuristic');
    expect(cb).not.toHaveBeenCalled();
  });

  it('is called once even when the model call then fails (heuristic fallback)', async () => {
    const llm = {
      id: 'openai',
      listModels: async () => [],
      complete: async () => {
        throw new Error('x');
      },
      completeStructured: async () => {
        throw new Error('provider down');
      },
    } as unknown as LLMProvider;
    const { svc } = service({ llm });
    const cb = vi.fn();
    const r = await svc.derive('w1', 'pr-1', { onClassifierPrompt: cb });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(r.stored.method).toBe('heuristic');
  });
});
