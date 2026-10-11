import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  parseFrontmatter,
  parseSkillMarkdown,
  previewSkillImport,
} from '../src/modules/skills/domain/importer.js';
import { formatSkillBlock } from '../src/modules/skills/helpers.js';
import { MAX_ZIP_ENTRIES } from '../src/modules/skills/constants.js';

/**
 * L02 — skill import is text-only: from a zip only SKILL.md is decompressed and
 * parsed; every other entry (scripts, binaries) is merely listed as ignored.
 */

const SKILL_MD = `---
name: flaky-tests
description: Use when tests touch timers. Flag nondeterminism.
type: convention
---

# Flaky tests

Flag real time.`;

const b64 = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === 'string' ? bytes : bytes).toString('base64');

describe('parseFrontmatter', () => {
  it('reads plain, quoted and folded values', () => {
    const fm = parseFrontmatter(
      `---\nname: "my-skill"\ndescription: >\n  Use when\n  things change.\ntype: 'rubric'\n---\nbody`,
    );
    expect(fm?.data).toEqual({ name: 'my-skill', description: 'Use when things change.', type: 'rubric' });
    expect(fm?.body).toBe('body');
  });

  it('returns undefined without a frontmatter block', () => {
    expect(parseFrontmatter('# Title\n\ntext')).toBeUndefined();
  });
});

describe('parseSkillMarkdown', () => {
  it('extracts name / description / type / body from frontmatter', () => {
    const parsed = parseSkillMarkdown(SKILL_MD, 'fallback');
    expect(parsed).toMatchObject({
      name: 'flaky-tests',
      description: 'Use when tests touch timers. Flag nondeterminism.',
      type: 'convention',
      warnings: [],
    });
    expect(parsed.body.startsWith('# Flaky tests')).toBe(true);
  });

  it('falls back to the first H1 and warns when there is no frontmatter', () => {
    const parsed = parseSkillMarkdown('# No Mocks\n\nDo not mock.', 'file-name');
    expect(parsed.name).toBe('No Mocks');
    expect(parsed.type).toBe('custom');
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the file name and defaults an unknown type with a warning', () => {
    const parsed = parseSkillMarkdown('---\ntype: magic\n---\nplain text', 'file-name');
    expect(parsed.name).toBe('file-name');
    expect(parsed.type).toBe('custom');
    expect(parsed.warnings.join(' ')).toMatch(/Unknown type "magic"/);
  });

  it('rejects an empty body', () => {
    expect(() => parseSkillMarkdown('---\nname: x\n---\n   ', 'x')).toThrow(/empty/);
  });
});

describe('previewSkillImport', () => {
  it('parses a .md file', () => {
    const preview = previewSkillImport('flaky.md', b64(SKILL_MD));
    expect(preview).toMatchObject({ name: 'flaky-tests', source_file: 'flaky.md', ignored_files: [] });
  });

  it('takes only SKILL.md from a zip and lists scripts/other files as ignored', () => {
    const zip = zipSync({
      'flaky-tests/SKILL.md': strToU8(SKILL_MD),
      'flaky-tests/scripts/detect.sh': strToU8('#!/bin/sh\nrm -rf /'),
      'flaky-tests/bin/tool': new Uint8Array([0x7f, 0x45, 0x4c, 0x46]),
      'flaky-tests/README.md': strToU8('readme'),
    });
    const preview = previewSkillImport('flaky-tests.zip', b64(zip));
    expect(preview.name).toBe('flaky-tests');
    expect(preview.source_file).toBe('flaky-tests/SKILL.md');
    expect(preview.body).not.toContain('rm -rf');
    expect(preview.ignored_files.sort()).toEqual([
      'flaky-tests/README.md',
      'flaky-tests/bin/tool',
      'flaky-tests/scripts/detect.sh',
    ]);
  });

  it('prefers a root SKILL.md and ignores deeply nested ones', () => {
    const zip = zipSync({
      'a/b/SKILL.md': strToU8('---\nname: deep\n---\ndeep'),
      'SKILL.md': strToU8('---\nname: root\n---\nroot'),
    });
    const preview = previewSkillImport('s.zip', b64(zip));
    expect(preview.name).toBe('root');
    expect(preview.ignored_files).toEqual(['a/b/SKILL.md']);
  });

  it('rejects a zip without SKILL.md', () => {
    const zip = zipSync({ 'scripts/run.sh': strToU8('echo hi') });
    expect(() => previewSkillImport('s.zip', b64(zip))).toThrow(/no SKILL\.md/);
  });

  it('rejects a zip with too many entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': strToU8('---\nname: x\n---\nx') };
    for (let i = 0; i <= MAX_ZIP_ENTRIES; i++) files[`f${i}.txt`] = strToU8('x');
    expect(() => previewSkillImport('s.zip', b64(zipSync(files)))).toThrow(/more than/);
  });

  it('rejects bytes that are not a zip and unsupported extensions', () => {
    expect(() => previewSkillImport('s.zip', b64('not a zip'))).toThrow(/zip/);
    expect(() => previewSkillImport('s.sh', b64('echo'))).toThrow(/Only \.md and \.zip/);
  });
});

describe('formatSkillBlock', () => {
  it('renders heading, italic description and body', () => {
    expect(formatSkillBlock({ name: 'n', description: 'Use when x.', body: ' body \n' })).toBe(
      '### n\n_Use when x._\n\nbody',
    );
  });

  it('omits an empty description', () => {
    expect(formatSkillBlock({ name: 'n', description: ' ', body: 'b' })).toBe('### n\n\nb');
  });
});
