import { strFromU8, unzipSync } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { ValidationError } from '../../../platform/errors.js';
import {
  DEFAULT_IMPORT_SKILL_TYPE,
  MAX_IMPORT_FILE_BYTES,
  MAX_SKILL_MD_BYTES,
  MAX_ZIP_ENTRIES,
  SKILL_MD_FILENAME,
} from '../constants.js';

/**
 * L02 — skill import. Pure: bytes in, a `SkillImportPreview` out; nothing is
 * persisted (the user confirms, then the UI calls POST /skills).
 *
 * A skill is TEXT only. From a `.zip` we decompress exactly one entry — the
 * `SKILL.md` — and merely list every other entry (scripts, binaries, references)
 * as ignored: they are never decompressed, stored or executed.
 */

interface ParsedMarkdown {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

/** Strip matching single/double quotes around a YAML scalar. */
function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Minimal YAML-frontmatter reader for the keys a skill needs: `key: value`,
 * quoted values, and block scalars (`key: >` / `key: |`) with indented
 * continuation lines. Unknown keys are kept but ignored by the caller.
 */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } | undefined {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (!match) return undefined;

  const data: Record<string, string> = {};
  let currentKey: string | undefined;
  let block: string[] = [];
  let folded = false;
  const flush = () => {
    if (currentKey !== undefined && block.length > 0) {
      data[currentKey] = folded ? block.join(' ').trim() : block.join('\n').trim();
    }
    block = [];
  };

  for (const line of match[1]!.split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      flush();
      currentKey = kv[1]!;
      const raw = kv[2]!.trim();
      if (raw === '>' || raw === '>-' || raw === '|' || raw === '|-') {
        folded = raw.startsWith('>');
      } else {
        data[currentKey] = unquote(raw);
        currentKey = undefined;
      }
    } else if (currentKey !== undefined && /^\s+\S/.test(line)) {
      block.push(line.trim());
    }
  }
  flush();
  return { data, body: normalized.slice(match[0].length) };
}

/** Turn a markdown document into the skill core. `fallbackName` = file name without extension. */
export function parseSkillMarkdown(text: string, fallbackName: string): ParsedMarkdown {
  const warnings: string[] = [];
  const fm = parseFrontmatter(text);
  let body = (fm ? fm.body : text.replace(/^﻿/, '').replace(/\r\n/g, '\n')).trim();
  const data = fm?.data ?? {};
  if (!fm) warnings.push('No frontmatter found — name taken from the first heading or the file name.');

  let name = data.name?.trim() ?? '';
  if (!name) {
    const h1 = /^#\s+(.+)$/m.exec(body);
    name = h1 ? h1[1]!.trim() : fallbackName;
  }

  const description = data.description?.trim() ?? '';
  if (!description) warnings.push('No description — write one as a directive ("Use when…") before saving.');

  const parsedType = SkillType.safeParse(data.type?.trim().toLowerCase());
  const type: SkillType = parsedType.success ? parsedType.data : DEFAULT_IMPORT_SKILL_TYPE;
  if (data.type && !parsedType.success) {
    warnings.push(`Unknown type "${data.type}" — defaulted to "${DEFAULT_IMPORT_SKILL_TYPE}".`);
  }

  if (!body) throw new ValidationError('The skill body is empty');
  if (body.length > MAX_SKILL_MD_BYTES) body = body.slice(0, MAX_SKILL_MD_BYTES);
  return { name: name.slice(0, 120), description: description.slice(0, 2000), type, body, warnings };
}

/** Depth of a zip path: `SKILL.md` → 0, `my-skill/SKILL.md` → 1. */
function depth(path: string): number {
  return path.split('/').length - 1;
}

function isSkillMd(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  return base.toLowerCase() === SKILL_MD_FILENAME && depth(path) <= 1;
}

/** Extract the `SKILL.md` core from a zip archive; list everything else as ignored. */
export function extractSkillFromZip(bytes: Uint8Array): { path: string; text: string; ignored: string[] } {
  const entries: { name: string; originalSize: number }[] = [];
  let unzipped: Record<string, Uint8Array>;
  try {
    // `filter` sees every entry from the central directory BEFORE decompression;
    // returning false means the entry's bytes are never inflated.
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        entries.push({ name: file.name, originalSize: file.originalSize });
        if (entries.length > MAX_ZIP_ENTRIES) return false;
        return isSkillMd(file.name) && file.originalSize <= MAX_SKILL_MD_BYTES;
      },
    });
  } catch (err) {
    throw new ValidationError(`Not a readable zip archive: ${(err as Error).message}`);
  }

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new ValidationError(`Archive has more than ${MAX_ZIP_ENTRIES} entries`);
  }
  const candidates = entries
    .filter((e) => isSkillMd(e.name))
    .sort((a, b) => depth(a.name) - depth(b.name));
  const chosen = candidates[0];
  if (!chosen) throw new ValidationError('Archive has no SKILL.md (at the root or one folder deep)');
  if (chosen.originalSize > MAX_SKILL_MD_BYTES) {
    throw new ValidationError(`SKILL.md is larger than ${MAX_SKILL_MD_BYTES / 1024} KB`);
  }
  const data = unzipped[chosen.name];
  if (!data) throw new ValidationError('SKILL.md could not be read');

  const ignored = entries
    .map((e) => e.name)
    .filter((n) => n !== chosen.name && !n.endsWith('/'));
  return { path: chosen.name, text: strFromU8(data), ignored };
}

/** Entry point for POST /skills/import/preview. */
export function previewSkillImport(filename: string, contentBase64: string): SkillImportPreview {
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.length === 0) throw new ValidationError('The file is empty');
  if (bytes.length > MAX_IMPORT_FILE_BYTES) {
    throw new ValidationError(`File is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`);
  }

  const lower = filename.toLowerCase();
  const baseName = filename.replace(/^.*[\\/]/, '').replace(/\.(md|markdown|zip)$/i, '');

  if (lower.endsWith('.zip')) {
    const { path, text, ignored } = extractSkillFromZip(new Uint8Array(bytes));
    const folder = path.includes('/') ? path.split('/')[0]! : baseName;
    const parsed = parseSkillMarkdown(text, folder);
    return {
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      body: parsed.body,
      source_file: path,
      ignored_files: ignored,
      warnings: parsed.warnings,
    };
  }

  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const parsed = parseSkillMarkdown(bytes.toString('utf8'), baseName);
    return {
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      body: parsed.body,
      source_file: filename,
      ignored_files: [],
      warnings: parsed.warnings,
    };
  }

  throw new ValidationError('Only .md and .zip files can be imported');
}
