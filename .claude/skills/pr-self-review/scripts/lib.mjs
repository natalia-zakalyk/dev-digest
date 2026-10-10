// Shared helpers for the pr-self-review scripts: git plumbing, the content
// fingerprint, glob matching, the gate and the state directory (inside .git, so
// nothing here can ever be committed). No dependencies beyond Node ≥22.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
export const CATEGORIES = ['bug', 'security', 'perf', 'style', 'test'];

// Mirror of reviewer-core/src/output/to-review.ts:42-71 (SEV_RANK / FAIL_ON_MIN_RANK /
// gateTriggered). Can't import it: reviewer-core is TypeScript and there is no workspace.
export const SEV_RANK = { SUGGESTION: 1, WARNING: 2, CRITICAL: 3 };
export const FAIL_ON_MIN_RANK = { never: Number.POSITIVE_INFINITY, critical: 3, warning: 2, any: 1 };

export const fail = (tag, msg, code = 1) => { console.error(`${tag}: ${msg}`); process.exit(code); };

export function git(args, { cwd, allowFail = false, input } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${String(err.stderr || err.message).trim()}`);
  }
}

export const repoRoot = (cwd) => git(['rev-parse', '--show-toplevel'], { cwd }).trim();

/** State lives in <git-dir>/pr-self-review: never committed, per clone/worktree. */
export function stateDir(cwd) {
  const dir = join(git(['rev-parse', '--absolute-git-dir'], { cwd }).trim(), 'pr-self-review');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The ref a PR targets: origin/main if fetched, else local main. */
export function mainRef(cwd) {
  for (const ref of ['origin/main', 'main']) {
    if (git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd, allowFail: true })) return ref;
  }
  throw new Error('neither origin/main nor main exists');
}

export const mergeBase = (rev, cwd) => git(['merge-base', rev, mainRef(cwd)], { cwd }).trim();

/** Parse `git diff --name-status -z -M` output into [{status, path, old_path}]. */
export function parseNameStatus(out) {
  const parts = out.split('\0').filter((p) => p !== '');
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    const status = code[0];
    if (status === 'R' || status === 'C') {
      const old_path = parts[i++];
      const path = parts[i++];
      files.push({ status, path, old_path: status === 'R' ? old_path : null });
    } else {
      files.push({ status, path: parts[i++], old_path: null });
    }
  }
  return files;
}

/**
 * Changed files of the working tree vs `base`: committed + staged + unstaged
 * (`git diff <base>` compares the worktree to the commit) + untracked files.
 */
export function worktreeChanges(base, cwd) {
  const files = parseNameStatus(git(['diff', '--name-status', '-z', '-M', base], { cwd }));
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd }).split('\0').filter(Boolean);
  for (const path of untracked) files.push({ status: 'A', path, old_path: null, untracked: true });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Changed files of commit `sha` vs `base` (what a push of `sha` would publish). */
export function commitChanges(base, sha, cwd) {
  return parseNameStatus(git(['diff', '--name-status', '-z', '-M', base, sha], { cwd }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Every path whose content matters: new paths plus the source side of renames. */
export function touchedPaths(files) {
  const set = new Set();
  for (const f of files) { set.add(f.path); if (f.old_path) set.add(f.old_path); }
  return [...set].sort();
}

/** Blob ids of `paths` in the working tree; '-' for paths that don't exist. */
export function worktreeBlobs(paths, cwd) {
  const root = repoRoot(cwd);
  const present = paths.filter((p) => existsSync(join(root, p)));
  const blobs = Object.fromEntries(paths.map((p) => [p, '-']));
  if (present.length) {
    const out = git(['hash-object', '--stdin-paths'], { cwd: root, input: present.join('\n') + '\n' }).trim().split('\n');
    present.forEach((p, i) => { blobs[p] = out[i]; });
  }
  return blobs;
}

/** Blob ids of `paths` in commit `sha`; '-' for paths missing there. */
export function commitBlobs(paths, sha, cwd) {
  const blobs = Object.fromEntries(paths.map((p) => [p, '-']));
  if (!paths.length) return blobs;
  const out = git(['ls-tree', '-r', '-z', sha, '--', ...paths], { cwd: repoRoot(cwd) });
  for (const entry of out.split('\0').filter(Boolean)) {
    const [meta, path] = entry.split('\t');
    if (path in blobs) blobs[path] = meta.split(' ')[2];
  }
  return blobs;
}

/**
 * Content fingerprint: sha256 of sorted "path\tblob" lines. Identical for the
 * working tree before a commit and for the commit itself when contents match,
 * so a review done before `git commit` still covers the push.
 */
export function fingerprint(blobs) {
  const lines = Object.keys(blobs).sort().map((p) => `${p}\t${blobs[p]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export const sha = (s, n = 64) => createHash('sha256').update(s).digest('hex').slice(0, n);

/** Minimal glob → RegExp: `**`, `*`, `?`, `{a,b}`. Paths are repo-relative POSIX. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const globCache = new Map();
export function matchesAny(path, globs = []) {
  return globs.some((g) => {
    if (!globCache.has(g)) globCache.set(g, globToRegExp(g));
    return globCache.get(g).test(path);
  });
}

export function isBinary(absPath) {
  try {
    const fd = openSync(absPath, 'r');
    const buf = Buffer.alloc(8000);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    return buf.subarray(0, n).includes(0);
  } catch { return false; }
}

export const moduleOf = (path) => {
  const top = path.split('/')[0];
  return ['server', 'client', 'reviewer-core', 'e2e'].includes(top) ? top : 'root';
};

export function readJson(file, fallback) {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${file} not found`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Atomic write: either the old file or the fully written new one. */
export function writeAtomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

export const loadSkillMap = () => readJson(join(SKILL_DIR, 'skill-map.json'));

export function normalizeSeverity(raw, skillMap) {
  const key = String(raw ?? '').toUpperCase().trim();
  return skillMap.severityMap[key] ?? null;
}

export function gateBlockers(findings, failOn) {
  const min = FAIL_ON_MIN_RANK[failOn];
  if (min === undefined) throw new Error(`unknown failOn "${failOn}"`);
  return findings.filter((f) => !f.dismissed && (SEV_RANK[f.severity] ?? 0) >= min);
}
