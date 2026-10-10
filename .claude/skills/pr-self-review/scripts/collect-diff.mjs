#!/usr/bin/env node
// Step 1: collect everything a PR from this branch would contain — commits since
// merge-base(main) plus staged, unstaged and untracked files — with one unified
// patch per file and the content fingerprint the pre-push gate re-checks.
// Usage: node collect-diff.mjs          → writes <state>/diff.json, prints a summary
import { join } from 'node:path';
import { rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  git, repoRoot, stateDir, mergeBase, worktreeChanges, touchedPaths, worktreeBlobs,
  fingerprint, isBinary, moduleOf, writeAtomic, fail,
} from './lib.mjs';

try {
  const root = repoRoot();
  const state = stateDir();
  const base = mergeBase('HEAD');
  const head = git(['rev-parse', 'HEAD']).trim();
  const files = worktreeChanges(base);
  const blobs = worktreeBlobs(touchedPaths(files));

  // +/- line counts for tracked files (binary → '-').
  const numstat = {};
  for (const line of git(['diff', '--numstat', '-M', base]).split('\n').filter(Boolean)) {
    const [add, del, ...rest] = line.split('\t');
    const path = rest.join('\t').replace(/^(.*)\{(.*) => (.*)\}(.*)$/, '$1$3$4').replace(/^.* => /, '');
    numstat[path] = { additions: add === '-' ? null : Number(add), deletions: del === '-' ? null : Number(del) };
  }

  const patchDir = join(state, 'patches');
  rmSync(patchDir, { recursive: true, force: true });

  const out = files.map((f, i) => {
    const abs = join(root, f.path);
    const binary = f.status !== 'D' && (f.untracked ? isBinary(abs) : numstat[f.path]?.additions === null);
    let patch = null;
    if (!binary && f.status !== 'D') {
      const text = f.untracked
        // --no-index exits 1 when files differ, so read stdout ourselves.
        ? gitNoIndex(f.path, root)
        : git(['diff', '-M', base, '--', ...(f.old_path ? [f.old_path, f.path] : [f.path])], { cwd: root });
      patch = join(patchDir, `${String(i).padStart(4, '0')}-${f.path.replace(/[^\w.-]+/g, '_')}.diff`);
      writeAtomic(patch, text);
    }
    const lines = f.untracked && !binary ? countLines(patch) : numstat[f.path] ?? { additions: null, deletions: null };
    return {
      path: f.path, old_path: f.old_path, status: f.status, untracked: !!f.untracked,
      module: moduleOf(f.path), blob: blobs[f.path], binary, patch, ...lines,
    };
  });

  const diff = { base, head, generated_at: new Date().toISOString(), fingerprint: fingerprint(blobs), files: out };
  writeAtomic(join(state, 'diff.json'), JSON.stringify(diff, null, 2));

  const byModule = {};
  for (const f of out) byModule[f.module] = (byModule[f.module] ?? 0) + 1;
  console.log(JSON.stringify({
    state_dir: state, base, head, fingerprint: diff.fingerprint, files: out.length, by_module: byModule,
    empty: out.length === 0,
  }, null, 2));
} catch (err) {
  fail('collect-diff', err.message);
}

// `git diff --no-index` exits 1 when the files differ — the normal case here.
function gitNoIndex(path, cwd) {
  const r = spawnSync('git', ['diff', '--no-index', '--', '/dev/null', path], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git diff --no-index ${path}: ${r.stderr}`);
  return r.stdout;
}

function countLines(patch) {
  const added = readFileSync(patch, 'utf8').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  return { additions: added, deletions: 0 };
}
