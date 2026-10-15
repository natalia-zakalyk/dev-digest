#!/usr/bin/env node
// git pre-push gate (installed via scripts/install-git-hooks.sh). No LLM, no network:
// for every pushed ref it recomputes the content fingerprint of merge-base(main)..<sha>
// and allows the push only if the last /pr-self-review report covers exactly that
// content and has no active blocker. stdin: "<local ref> <local sha> <remote ref> <remote sha>" lines.
// Bypass (documented, deliberate): git push --no-verify
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { stateDir, mergeBase, commitChanges, touchedPaths, commitBlobs, fingerprint, gateBlockers } from './lib.mjs';

const ZERO = /^0+$/;
const out = (s) => process.stderr.write(`${s}\n`);
const block = (lines) => {
  out('');
  out('⛔ pre-push: blocked by pr-self-review');
  for (const l of lines) out(`   ${l}`);
  out('');
  out('   Run /pr-self-review in Claude Code (or ask "run pr self review"), fix or dismiss findings, then push again.');
  out('   Emergency bypass: git push --no-verify (the PR will not have a passing self-review).');
  out('');
  process.exit(1);
};

let input = '';
try { input = readFileSync(0, 'utf8'); } catch { /* no stdin */ }

try {
  const state = stateDir();
  const reportFile = join(state, 'report.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;

  for (const line of input.split('\n').filter(Boolean)) {
    const [, localSha, remoteRef = ''] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // branch deletion
    // Decide by the DESTINATION: `git push origin HEAD:x` or `<sha>:x` sends local ref "HEAD"/a sha,
    // but still updates a branch. Only non-branch targets (tags, notes) are out of scope.
    if (!remoteRef.startsWith('refs/heads/')) continue;

    const base = mergeBase(localSha);
    const files = commitChanges(base, localSha);
    if (!files.length) continue; // nothing new vs main

    const fp = fingerprint(commitBlobs(touchedPaths(files), localSha));
    const branch = remoteRef.replace('refs/heads/', '');
    if (!report) block([`No self-review report for "${branch}" (${files.length} changed files vs main).`]);
    if (report.fingerprint !== fp) {
      block([
        `The last self-review does not match what you are pushing on "${branch}".`,
        `reviewed ${report.fingerprint.slice(0, 12)} at ${report.generated_at}, pushing ${fp.slice(0, 12)}.`,
        'Code changed after the review, or the review included uncommitted changes that are not in this commit.',
      ]);
    }
    const blockers = gateBlockers(report.findings, report.failOn);
    if (blockers.length) {
      block([
        `${blockers.length} blocking finding(s) (failOn: ${report.failOn}) on "${branch}":`,
        ...blockers.slice(0, 15).map((f) => `  ${f.severity} ${f.file}:${f.start_line} — ${f.title} [${f.id}]`),
        ...(blockers.length > 15 ? [`  … and ${blockers.length - 15} more (see ${join(state, 'report.md')})`] : []),
      ]);
    }
    out(`✓ pre-push: self-review PASS for "${branch}" (${report.counts.WARNING} warning, ${report.counts.SUGGESTION} suggestion)`);
  }
  process.exit(0);
} catch (err) {
  // Fail closed: a broken gate must not silently let code through.
  block([`gate error: ${err.message}`]);
}
