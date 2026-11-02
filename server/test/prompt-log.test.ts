import { describe, it, expect } from 'vitest';
import { assemblePrompt, type PromptSectionMeta } from '@devdigest/reviewer-core';
import {
  buildPromptLogRecord,
  MAX_PROMPT_LOG_BYTES,
  safeModel,
  safeRef,
  safeText,
  summarizePromptLog,
  type PromptLogInput,
  type PromptLogSectionInput,
} from '../src/platform/prompt-log.js';

/**
 * Prompt-assembly log record: allow-list builder (server/specs/prompt-assembly-logging.md).
 * The record must never carry prompt text, secrets or URL userinfo/query/fragment.
 */

const SENTINELS = {
  diff: 'SENTINEL_DIFF_7f3a',
  prBody: 'SENTINEL_PR_BODY_c91e',
  spec: 'SENTINEL_SPEC_BODY_44d0',
  skill: 'SENTINEL_SKILL_BODY_aa12',
  system: 'SENTINEL_SYSTEM_PROMPT_5b8c',
  title: 'SENTINEL_PR_TITLE_90de',
  doc: 'SENTINEL_DOC_BODY_31fa',
  orKey: 'sk-or-v1-SENTINELSECRET0000000000000000',
  ghToken: 'ghp_SENTINEL000000000000000000000000',
  userinfo: 'SENTINEL_USERINFO_pw12',
  query: 'SENTINEL_QUERY_tok9',
  fragment: 'SENTINEL_FRAGMENT_77ab',
} as const;

const HASH = 'abcdef012345';

/** Real reviewer-core sections for a prompt that contains every sentinel. */
function realSections(): PromptSectionMeta[] {
  return assemblePrompt(
    {
      system: SENTINELS.system,
      task: `Review PR ${SENTINELS.title}`,
      prDescription: SENTINELS.prBody,
      skills: [SENTINELS.skill, `${SENTINELS.skill}-2`],
      memory: ['remember me'],
      specs: [SENTINELS.spec],
      repoMap: 'repo map text',
      callers: 'callers text',
      diff: SENTINELS.diff,
    },
    { measure: (t) => ({ tokens: Math.ceil(t.length / 4), hash: HASH }) },
  ).sections;
}

/** What the executor does: copy the metadata, adding no text. */
function toInputs(sections: PromptSectionMeta[]): PromptLogSectionInput[] {
  return sections.map((s) => ({ ...s, itemsMeta: s.itemsMeta.map((i) => ({ ...i })) }));
}

const hostileRefs = [
  `https://user:${SENTINELS.userinfo}@host.example/spec.md?token=${SENTINELS.query}#${SENTINELS.fragment}`,
  SENTINELS.orKey,
];

function baseInput(over: Partial<PromptLogInput> = {}): PromptLogInput {
  return {
    call: 'review',
    correlationId: 'corr-1',
    runId: 'run-1',
    agentId: 'agent-1',
    prId: 'pr-1',
    provider: 'openrouter',
    model: 'openai/gpt-4.1',
    mode: 'map-reduce',
    chunk: { index: 0, count: 2, label: 'src/a.ts' },
    sections: toInputs(realSections()),
    verbose: false,
    itemRefs: { skills: ['my-skill@v3', hostileRefs[0]!], specs: [hostileRefs[1]!] },
    ...over,
  };
}

/** Every key path in a JSON value ("sections[].name", ...). */
function keyPaths(v: unknown, prefix = ''): string[] {
  if (Array.isArray(v)) return [...new Set(v.flatMap((x) => keyPaths(x, `${prefix}[]`)))];
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) => [`${prefix}.${k}`.replace(/^\./, ''), ...keyPaths(x, `${prefix}.${k}`.replace(/^\./, ''))]);
  }
  return [];
}

describe('buildPromptLogRecord — no content or secret ever reaches the record', () => {
  const modes: [string, Partial<PromptLogInput>][] = [
    ['default', {}],
    ['verbose', { verbose: true }],
    ['verbose + hashes', { verbose: true, hashes: true }],
  ];

  it.each(modes)('%s mode: no sentinel text, key, token or URL parts anywhere', (_name, over) => {
    // Hostile free-text too: label, refs, model, ids carry secrets.
    const rec = buildPromptLogRecord(
      baseInput({
        ...over,
        chunk: { index: 0, count: 2, label: `src/${SENTINELS.ghToken}/a.ts` },
        model: SENTINELS.orKey,
        // Ids are shape-checked only (server-generated UUIDs), so a malformed one is rejected.
        correlationId: `${SENTINELS.ghToken}?x=1`,
      }),
    );
    const json = JSON.stringify(rec);
    for (const s of Object.values(SENTINELS)) expect(json, s).not.toContain(s);
    expect(json).not.toContain('SENTINEL');
    // Sections only describe sizes/flags: no text-bearing fields.
    expect(rec.model).toBe('[invalid]');
    expect(rec.correlation_id).toBe('[invalid]');
  });

  it('the real section metadata of an assembled prompt contains no content', () => {
    const json = JSON.stringify(buildPromptLogRecord(baseInput({ verbose: true, hashes: true })));
    for (const s of [SENTINELS.diff, SENTINELS.prBody, SENTINELS.spec, SENTINELS.skill, SENTINELS.system, SENTINELS.title]) {
      expect(json).not.toContain(s);
    }
  });

  it('only documented keys exist (default mode)', () => {
    const rec = buildPromptLogRecord(baseInput());
    expect(Object.keys(rec).sort()).toEqual(
      [
        'event', 'schema_version', 'call', 'correlation_id', 'run_id', 'run_ids', 'agent_id', 'pr_id',
        'provider', 'model', 'mode', 'chunk', 'sections', 'totals', 'verbose',
      ].sort(),
    );
    expect(rec).not.toHaveProperty('items');
    expect(rec).not.toHaveProperty('items_truncated');
    expect(keyPaths(rec).filter((p) => p.startsWith('sections[].')).map((p) => p.replace('sections[].', '')).sort()).toEqual(
      ['chars', 'items', 'name', 'source', 'tokens', 'truncated', 'trust', 'wrapped'].sort(),
    );
    expect(Object.keys(rec.chunk).sort()).toEqual(['count', 'index', 'label']);
    expect(Object.keys(rec.totals).sort()).toEqual(['chars', 'sections', 'tokens']);
  });

  it('a spread-style leak is impossible: extra producer fields are not copied', () => {
    const input = baseInput();
    // A producer that (wrongly) attaches text to a section or item must not get it logged.
    (input.sections[0] as unknown as Record<string, unknown>).text = SENTINELS.system;
    (input.sections.find((s) => s.name === 'skills')!.itemsMeta[0] as unknown as Record<string, unknown>).text = SENTINELS.skill;
    for (const verbose of [false, true]) {
      const json = JSON.stringify(buildPromptLogRecord({ ...input, verbose }));
      expect(json).not.toContain('SENTINEL');
    }
  });

  it('verbose mode adds only the documented item keys', () => {
    const rec = buildPromptLogRecord(baseInput({ verbose: true, hashes: true }));
    expect(rec.items!.length).toBeGreaterThan(0);
    const keys = new Set(keyPaths(rec.items).map((p) => p.replace('[].', '')));
    expect([...keys].sort()).toEqual(['chars', 'index', 'ref', 'section', 'sha256_12', 'tokens']);
  });
});

describe('buildPromptLogRecord — verbose / hashes', () => {
  it('default mode drops items even when hashes is requested', () => {
    const rec = buildPromptLogRecord(baseInput({ verbose: false, hashes: true }));
    expect(rec.verbose).toBe(false);
    expect(rec).not.toHaveProperty('items');
    expect(JSON.stringify(rec)).not.toContain(HASH);
  });

  it('verbose without hashes: items present, no sha256_12', () => {
    const rec = buildPromptLogRecord(baseInput({ verbose: true }));
    expect(rec.items!.length).toBeGreaterThan(0);
    expect(rec.items!.every((i) => !('sha256_12' in i))).toBe(true);
    expect(JSON.stringify(rec)).not.toContain(HASH);
  });

  it('verbose + hashes: keeps exactly 12-hex hashes and drops anything else', () => {
    const sections = toInputs(realSections());
    const skills = sections.find((s) => s.name === 'skills')!;
    skills.itemsMeta[0]!.hash = HASH;
    skills.itemsMeta[1]!.hash = 'ABCDEF012345'; // uppercase
    const specs = sections.find((s) => s.name === 'specs')!;
    specs.itemsMeta[0]!.hash = `${HASH}0`; // 13 chars
    const mem = sections.find((s) => s.name === 'memory')!;
    mem.itemsMeta[0]!.hash = 'SENTINEL_DIFF_'; // not hex
    const rec = buildPromptLogRecord(baseInput({ sections, verbose: true, hashes: true }));
    const hashes = rec.items!.filter((i) => i.sha256_12 !== undefined).map((i) => i.sha256_12);
    expect(hashes).toEqual([HASH]);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it('verbose items: skills use the supplied refs, specs fall back to spec-<index>, sizes are kept', () => {
    const rec = buildPromptLogRecord(baseInput({ verbose: true, itemRefs: { skills: ['my-skill@v3', 'other@v1'] } }));
    const skills = rec.items!.filter((i) => i.section === 'skills');
    expect(skills.map((i) => i.ref)).toEqual(['my-skill@v3', 'other@v1']);
    expect(rec.items!.filter((i) => i.section === 'specs').map((i) => i.ref)).toEqual(['spec-0']);
    expect(rec.items!.filter((i) => i.section === 'memory').map((i) => i.ref)).toEqual([null]);
    expect(skills[0]!.chars).toBe(SENTINELS.skill.length);
  });
});

describe('buildPromptLogRecord — size cap', () => {
  const manyItems = (n: number): PromptLogSectionInput[] => [
    {
      name: 'specs',
      source: 'project_specs',
      trust: 'untrusted',
      wrapped: true,
      chars: 1000,
      tokens: 250,
      items: n,
      truncated: false,
      itemsMeta: Array.from({ length: n }, (_, index) => ({
        index,
        chars: 10,
        tokens: 3,
        ref: `docs/some/long/path/spec-file-number-${index}.md`,
      })),
    },
  ];

  it('small verbose record stays under the cap with items and no truncation flag', () => {
    const rec = buildPromptLogRecord(baseInput({ sections: manyItems(3), verbose: true }));
    expect(rec.items).toHaveLength(3);
    expect(rec.items_truncated).toBeUndefined();
    expect(JSON.stringify(rec).length).toBeLessThanOrEqual(MAX_PROMPT_LOG_BYTES);
  });

  it('over the 16 KiB cap: items are dropped and items_truncated is set', () => {
    expect(MAX_PROMPT_LOG_BYTES).toBe(16 * 1024);
    const rec = buildPromptLogRecord(baseInput({ sections: manyItems(400), verbose: true }));
    expect(rec).not.toHaveProperty('items');
    expect(rec.items_truncated).toBe(true);
    expect(rec.sections).toHaveLength(1);
    expect(rec.sections[0]!.items).toBe(400);
    expect(JSON.stringify(rec).length).toBeLessThanOrEqual(MAX_PROMPT_LOG_BYTES);
  });
});

describe('buildPromptLogRecord — totals, nullability, sanitising', () => {
  it('totals count only sections that were not dropped; tokens null when any live section has none', () => {
    const mk = (name: PromptLogSectionInput['name'], chars: number, tokens: number | null, dropped?: boolean): PromptLogSectionInput => ({
      name, source: 'engine', trust: 'trusted', wrapped: false, chars, tokens, items: 1, truncated: false, itemsMeta: [],
      ...(dropped !== undefined ? { dropped } : {}),
    });
    const a = buildPromptLogRecord(baseInput({ sections: [mk('system', 10, 3), mk('header', 20, 5), mk('prior_prs', 99, 50, true)] }));
    expect(a.totals).toEqual({ chars: 30, tokens: 8, sections: 2 });
    expect(a.sections.find((s) => s.name === 'prior_prs')!.dropped).toBe(true);
    expect(a.sections[0]).not.toHaveProperty('dropped');

    const b = buildPromptLogRecord(baseInput({ sections: [mk('system', 10, null), mk('header', 20, 5)] }));
    expect(b.totals).toEqual({ chars: 30, tokens: null, sections: 2 });
  });

  it('clamps negative / non-finite numbers to 0', () => {
    const sections = toInputs(realSections()).slice(0, 1);
    sections[0]!.chars = -5;
    sections[0]!.tokens = Number.NaN;
    const rec = buildPromptLogRecord(baseInput({ sections, chunk: { index: -1, count: Infinity, label: null } }));
    expect(rec.sections[0]).toMatchObject({ chars: 0, tokens: 0 });
    expect(rec.chunk).toEqual({ index: 0, count: 0, label: null });
  });

  it('review ids pass through, run_ids null by default and sanitised when given', () => {
    const rec = buildPromptLogRecord(baseInput());
    expect(rec).toMatchObject({ run_id: 'run-1', agent_id: 'agent-1', pr_id: 'pr-1', run_ids: null, provider: 'openrouter' });
    const cls = buildPromptLogRecord(
      baseInput({ call: 'intent_classifier', runId: null, agentId: null, mode: null, runIds: ['r1', 'bad id!'] }),
    );
    expect(cls).toMatchObject({ run_id: null, agent_id: null, mode: null, run_ids: ['r1', '[invalid]'] });
  });

  it('non-id values in id fields become [invalid]', () => {
    const rec = buildPromptLogRecord(baseInput({ prId: 'pr 1\nforged line', provider: `p/${SENTINELS.ghToken}` }));
    expect(rec.pr_id).toBe('[invalid]');
    expect(rec.provider).toBe('[invalid]');
  });
});

describe('safeRef / safeText / safeModel', () => {
  it('safeRef strips userinfo, query and fragment', () => {
    const out = safeRef(hostileRefs[0]!);
    expect(out).toBe('https://***@host.example/spec.md');
    expect(out).not.toMatch(/SENTINEL/);
  });

  it('safeRef keeps a leading #123 issue ref but drops a later fragment', () => {
    expect(safeRef('#123')).toBe('#123');
    expect(safeRef('docs/a.md#section')).toBe('docs/a.md');
    expect(safeRef('docs/a.md?x=1')).toBe('docs/a.md');
  });

  it.each([SENTINELS.orKey, SENTINELS.ghToken, 'AKIAABCDEFGHIJKLMNOP', '-----BEGIN RSA PRIVATE KEY-----'])(
    'secret-looking ref %j is replaced entirely',
    (secret) => {
      expect(safeRef(`prefix/${secret}/suffix`)).toMatch(/^(\[redacted\]|prefix\/\*\*\*\/suffix)$/);
      expect(safeRef(secret)).not.toContain(secret);
    },
  );

  it('safeText strips control chars (log forging) and caps length at 200', () => {
    expect(safeText('a\nb\r\tc\u0000d')).toBe('a b  c d');
    expect(safeText('x'.repeat(500))).toHaveLength(200);
  });

  it('safeModel keeps provider model ids and rejects the rest', () => {
    for (const ok of ['openai/gpt-4.1', 'anthropic/claude-sonnet-4.5:beta', 'gpt-4.1', 'meta-llama/llama-3@v1']) {
      expect(safeModel(ok)).toBe(ok);
    }
    for (const bad of ['', 'has space', 'a'.repeat(121), SENTINELS.orKey, 'm\nodel', 'm"odel']) {
      expect(safeModel(bad)).toBe('[invalid]');
    }
  });
});

describe('summarizePromptLog (Live Log line)', () => {
  it('is counts-only, with diff tokens when known', () => {
    const rec = buildPromptLogRecord(baseInput());
    const line = summarizePromptLog(rec);
    expect(line).toMatch(/^prompt: \d+ sections · ~[\d.]+k? tokens \(diff ~[\d.]+k?\)$/);
    expect(line).not.toContain('SENTINEL');
  });

  it('falls back to chars when tokens are unknown', () => {
    const sections = toInputs(realSections()).map((s) => ({ ...s, tokens: null }));
    const rec = buildPromptLogRecord(baseInput({ sections }));
    expect(summarizePromptLog(rec)).toBe(`prompt: ${rec.totals.sections} sections · ${rec.totals.chars} chars`);
  });

  it('formats thousands as k', () => {
    const sections = toInputs(realSections()).slice(0, 1);
    sections[0]!.tokens = 2500;
    expect(summarizePromptLog(buildPromptLogRecord(baseInput({ sections })))).toBe('prompt: 1 sections · ~2.5k tokens');
  });
});
