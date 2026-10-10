// Offline tests for the pr-self-review scripts. Each test builds a throwaway git repo
// and runs the real scripts against it.  Run: node --test .claude/skills/pr-self-review/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  globToRegExp, fingerprint, worktreeChanges, worktreeBlobs, commitChanges, commitBlobs, touchedPaths,
  gateBlockers, mergeBase,
} from './lib.mjs';
import { dismissalHints } from './report-format.mjs';
import { dedupe } from './write-report.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ENV = {
  ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};
const SKILLS = ['frontend-ui-architecture', 'react-best-practices', 'next-best-practices', 'typescript-expert',
  'onion-architecture', 'fastify-best-practices', 'security', 'zod'];

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pr-self-review-')));
  const g = (...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8' });
  g('init', '-q'); g('symbolic-ref', 'HEAD', 'refs/heads/main');
  const write = (path, content) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), content); };
  for (const s of SKILLS) write(`.claude/skills/${s}/SKILL.md`, `# ${s}\n`);
  write('README.md', 'base\n');
  write('client/src/app/page.tsx', 'export default function Page() { return null; }\n');
  write('server/src/modules/a/routes.ts', 'export const a = 1;\n');
  g('add', '-A'); g('commit', '-qm', 'base');
  g('checkout', '-qb', 'feature');
  const run = (script, args = [], input) => {
    const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: dir, env: ENV, encoding: 'utf8', input });
    let json = null;
    try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
  };
  const state = () => join(execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: dir, encoding: 'utf8' }).trim(), 'pr-self-review');
  return { dir, g, write, run, state, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Run the whole pipeline; `findingsFor(batch)` returns the LLM findings for a batch. */
function review(r, findingsFor = () => []) {
  assert.equal(r.run('collect-diff.mjs').code, 0);
  const routed = r.run('route-skills.mjs');
  assert.equal(routed.code, 0, routed.stderr);
  const checks = r.run('run-checks.mjs');
  assert.equal(checks.code, 0, checks.stderr);
  const batches = JSON.parse(readFileSync(join(r.state(), 'batches.json'), 'utf8'));
  mkdirSync(batches.findings_dir, { recursive: true });
  for (const b of batches.batches) writeFileSync(join(batches.findings_dir, `${b.id}.json`), JSON.stringify(findingsFor(b)));
  return { batches, report: r.run('write-report.mjs') };
}

const pushLine = (r, branch = 'feature') => `refs/heads/${branch} ${r.g('rev-parse', 'HEAD').trim()} refs/heads/${branch} ${'0'.repeat(40)}\n`;
const critical = (file) => ({ severity: 'CRITICAL', category: 'bug', title: 'raw fetch in component', file, start_line: 1, end_line: 1, rationale: 'r', confidence: 0.9, verified: true });

test('globToRegExp handles **, *, braces', () => {
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/app/page.tsx'));
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/a.ts'));
  assert.ok(!globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/a.js'));
  assert.ok(globToRegExp('**/*.md').test('README.md'));
  assert.ok(globToRegExp('**/vendor/shared/**').test('server/src/vendor/shared/x.ts'));
  assert.ok(!globToRegExp('server/*.ts').test('server/src/x.ts'));
});

test('fingerprint: same before and after commit, changes after an edit; handles rename/untracked/delete', () => {
  const r = repo();
  try {
    r.g('mv', 'README.md', 'DOCS.md');
    r.write('client/src/new.ts', 'export const x = 1;\n'); // untracked
    r.g('rm', '-q', 'server/src/modules/a/routes.ts');
    const base = mergeBase('HEAD', r.dir);
    const wt = worktreeChanges(base, r.dir);
    assert.deepEqual(wt.map((f) => [f.status, f.path]), [['A', 'client/src/new.ts'], ['R', 'DOCS.md'], ['D', 'server/src/modules/a/routes.ts']]);
    assert.equal(wt.find((f) => f.status === 'R').old_path, 'README.md');
    const before = fingerprint(worktreeBlobs(touchedPaths(wt), r.dir));

    r.g('add', '-A'); r.g('commit', '-qm', 'change');
    const head = r.g('rev-parse', 'HEAD').trim();
    const cc = commitChanges(base, head, r.dir);
    assert.equal(fingerprint(commitBlobs(touchedPaths(cc), head, r.dir)), before);

    r.write('client/src/new.ts', 'export const x = 2;\n');
    assert.notEqual(fingerprint(worktreeBlobs(touchedPaths(worktreeChanges(base, r.dir)), r.dir)), before);
  } finally { r.cleanup(); }
});

test('routing: UI skills only on client/, backend skills only on server/, unmatched files listed', () => {
  const r = repo();
  try {
    r.write('client/src/app/page.tsx', 'export default function Page() { return 1; }\n');
    r.write('server/src/modules/a/routes.ts', 'export const a = 2;\n');
    r.write('scripts/foo.sh', 'echo hi\n');
    r.write('.claude/skills/brand-new/SKILL.md', '# new\n');
    r.run('collect-diff.mjs');
    const out = r.run('route-skills.mjs');
    const b = JSON.parse(readFileSync(join(r.state(), 'batches.json'), 'utf8'));
    const skillsFor = (path) => b.batches.filter((x) => x.files.some((f) => f.path === path)).map((x) => x.skill).sort();
    assert.deepEqual(skillsFor('client/src/app/page.tsx'), ['frontend-ui-architecture', 'next-best-practices', 'react-best-practices', 'typescript-expert']);
    assert.deepEqual(skillsFor('server/src/modules/a/routes.ts'), ['fastify-best-practices', 'onion-architecture', 'security', 'typescript-expert']);
    assert.ok(b.unreviewed.includes('scripts/foo.sh'));
    assert.ok(out.json.warnings.some((w) => w.includes('brand-new')));
  } finally { r.cleanup(); }
});

test('cache: unchanged files are not re-reviewed; changed file or changed skill lens is', () => {
  const r = repo();
  try {
    r.write('client/src/app/page.tsx', 'export default function Page() { return 1; }\n');
    r.write('client/src/app/other.tsx', 'export const o = 1;\n');
    r.write('client/src/app/page.test.tsx', 'test\n');
    review(r);
    r.write('client/src/app/other.tsx', 'export const o = 2;\n');
    let { batches } = review(r);
    assert.ok(batches.batches.every((b) => b.files.every((f) => f.path === 'client/src/app/other.tsx')));
    assert.equal(batches.batches.length, 4);

    r.write('.claude/skills/next-best-practices/SKILL.md', '# next v2\n');
    ({ batches } = review(r));
    const nb = batches.batches.find((b) => b.skill === 'next-best-practices');
    assert.equal(nb.files.length, 2);
    assert.equal(batches.batches.length, 1);
  } finally { r.cleanup(); }
});

test('deterministic checks: Do-not-touch, secrets (value hidden), migrations, lockfile, missing tests', () => {
  const r = repo();
  try {
    const fakeKey = 'ghp' + '_' + 'a'.repeat(36);
    r.write('server/.env', 'X=1\n');
    r.write('client/src/lib/conf.ts', `export const token = "${fakeKey}";\n`);
    r.write('CLAUDE.md', '# no\n');
    r.write('server/pnpm-lock.yaml', 'lock\n');
    r.run('collect-diff.mjs');
    const out = r.run('run-checks.mjs');
    assert.equal(out.code, 0, out.stderr);
    const checks = readFileSync(join(r.state(), 'checks.json'), 'utf8');
    const f = JSON.parse(checks).findings;
    const has = (skill, file) => f.some((x) => x.skill === `checks:${skill}` && x.file === file);
    assert.ok(has('do-not-touch', 'server/.env'));
    assert.ok(has('do-not-touch', 'CLAUDE.md'));
    assert.ok(has('secrets', 'client/src/lib/conf.ts'));
    assert.equal(f.find((x) => x.skill === 'checks:secrets').start_line, 1);
    assert.ok(!checks.includes(fakeKey), 'secret value must not be in the report');
    assert.ok(has('lockfile', 'server/pnpm-lock.yaml'));
    const tests = f.find((x) => x.skill === 'checks:tests');
    assert.equal(tests.severity, 'WARNING');
    assert.match(tests.title, /client/);
  } finally { r.cleanup(); }
});

test('applied migration edits are CRITICAL, new migrations are fine', () => {
  const r = repo();
  try {
    r.g('checkout', '-q', 'main');
    const journal = (entries) => JSON.stringify({ entries: entries.map((tag) => ({ tag })) }, null, 2) + '\n';
    r.write('server/src/db/migrations/0001_init.sql', 'create table a();\n');
    r.write('server/src/db/migrations/meta/_journal.json', journal(['0001_init']));
    r.g('add', '-A'); r.g('commit', '-qm', 'mig');
    r.g('checkout', '-q', 'feature'); r.g('rebase', '-q', 'main');
    r.write('server/src/db/migrations/0001_init.sql', 'create table b();\n');
    r.write('server/src/db/migrations/0002_new.sql', 'create table c();\n');
    r.write('server/src/db/migrations/meta/_journal.json', journal(['0001_init', '0002_new'])); // drizzle append: fine
    r.run('collect-diff.mjs');
    r.run('run-checks.mjs');
    const mig = () => JSON.parse(readFileSync(join(r.state(), 'checks.json'), 'utf8')).findings.filter((x) => x.skill === 'checks:migrations').map((x) => x.file);
    assert.deepEqual(mig(), ['server/src/db/migrations/0001_init.sql']);

    r.write('server/src/db/migrations/meta/_journal.json', journal(['0002_new'])); // rewrite: not fine
    r.run('collect-diff.mjs');
    r.run('run-checks.mjs');
    assert.ok(mig().includes('server/src/db/migrations/meta/_journal.json'));
  } finally { r.cleanup(); }
});

test('report: unverified CRITICAL rejected; verified CRITICAL blocks; dismiss unblocks; PR description written', () => {
  const r = repo();
  try {
    r.write('client/src/app/page.tsx', 'export default function Page() { return 1; }\n');
    r.write('client/src/app/page.test.tsx', 'test\n');
    const ui = (b) => b.skill === 'frontend-ui-architecture';
    const { report: bad } = review(r, (b) => (ui(b) ? [{ ...critical('client/src/app/page.tsx'), verified: false }] : []));
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /not verified/);

    const { report } = review(r, (b) => (ui(b) ? [critical('client/src/app/page.tsx'), { ...critical('client/src/app/page.tsx'), severity: 'HIGH', title: 'other' }] : []));
    assert.equal(report.code, 3, report.stderr);
    assert.equal(report.json.verdict, 'BLOCKED');
    assert.equal(report.json.counts.WARNING, 1, 'HIGH maps to WARNING');

    const id = report.json.blockers[0];
    const d = r.run('dismiss.mjs', [id, 'fetch goes through lib/api in this file']);
    assert.equal(d.code, 0, d.stderr);
    assert.equal(d.json.verdict, 'PASS');
    const desc = readFileSync(join(r.state(), 'pr-description.md'), 'utf8');
    assert.match(desc, /Changes by module/);
    assert.match(desc, /`client\/`/);
    assert.match(desc, /Generated with \[Claude Code\]/);
  } finally { r.cleanup(); }
});

test('pre-push: no report → block; PASS → allow (also after commit); stale → block; critical → block', () => {
  const r = repo();
  try {
    r.write('client/src/app/page.tsx', 'export default function Page() { return 1; }\n');
    r.write('client/src/app/page.test.tsx', 'test\n');
    r.g('add', '-A'); r.g('commit', '-qm', 'wip');
    assert.equal(r.run('pre-push.mjs', [], pushLine(r)).code, 1);

    // Review the uncommitted state, then commit it: the report still covers the push.
    r.write('client/src/app/page.tsx', 'export default function Page() { return 2; }\n');
    assert.equal(review(r).report.code, 0);
    r.g('add', '-A'); r.g('commit', '-qm', 'more');
    const ok = r.run('pre-push.mjs', [], pushLine(r));
    assert.equal(ok.code, 0, ok.stderr);

    r.write('client/src/app/page.tsx', 'export default function Page() { return 3; }\n');
    r.g('add', '-A'); r.g('commit', '-qm', 'after review');
    const stale = r.run('pre-push.mjs', [], pushLine(r));
    assert.equal(stale.code, 1);
    assert.match(stale.stderr, /does not match/);

    review(r, (b) => (b.skill === 'frontend-ui-architecture' ? [critical('client/src/app/page.tsx')] : []));
    const blocked = r.run('pre-push.mjs', [], pushLine(r));
    assert.equal(blocked.code, 1);
    assert.match(blocked.stderr, /raw fetch in component/);

    // `git push origin HEAD:x` / `<sha>:x` send local ref "HEAD"/a sha — still gated by the remote ref.
    const head = r.g('rev-parse', 'HEAD').trim();
    assert.equal(r.run('pre-push.mjs', [], `HEAD ${head} refs/heads/x ${'0'.repeat(40)}\n`).code, 1);
    assert.equal(r.run('pre-push.mjs', [], `${head} ${head} refs/heads/x ${'0'.repeat(40)}\n`).code, 1);
    // Tags are not branches → out of scope.
    assert.equal(r.run('pre-push.mjs', [], `refs/tags/v1 ${head} refs/tags/v1 ${'0'.repeat(40)}\n`).code, 0);

    // Branch deletion and an empty diff vs main pass.
    assert.equal(r.run('pre-push.mjs', [], `(delete) ${'0'.repeat(40)} refs/heads/x ${'0'.repeat(40)}\n`).code, 0);
    r.g('checkout', '-q', 'main');
    assert.equal(r.run('pre-push.mjs', [], pushLine(r, 'main')).code, 0);
  } finally { r.cleanup(); }
});

test('write-report refuses a tree that changed during the review', () => {
  const r = repo();
  try {
    r.write('client/src/app/page.tsx', 'export default function Page() { return 1; }\n');
    r.run('collect-diff.mjs'); r.run('route-skills.mjs'); r.run('run-checks.mjs');
    const b = JSON.parse(readFileSync(join(r.state(), 'batches.json'), 'utf8'));
    mkdirSync(b.findings_dir, { recursive: true });
    for (const x of b.batches) writeFileSync(join(b.findings_dir, `${x.id}.json`), '[]');
    r.write('client/src/app/page.tsx', 'changed\n');
    const out = r.run('write-report.mjs');
    assert.equal(out.code, 1);
    assert.match(out.stderr, /changed during the review/);
    assert.ok(!existsSync(join(r.state(), 'report.json')));
  } finally { r.cleanup(); }
});

test('gate thresholds, dedupe and dismissal hints', () => {
  const f = (severity) => ({ severity });
  assert.equal(gateBlockers([f('WARNING')], 'critical').length, 0);
  assert.equal(gateBlockers([f('WARNING')], 'warning').length, 1);
  assert.equal(gateBlockers([f('SUGGESTION')], 'any').length, 1);
  assert.equal(gateBlockers([f('CRITICAL')], 'never').length, 0);
  assert.equal(gateBlockers([{ severity: 'CRITICAL', dismissed: { reason: 'x' } }], 'critical').length, 0);

  const base = { file: 'a.ts', start_line: 3, end_line: 3, title: 'Same', rationale: 'r', confidence: 1 };
  const d = dedupe([{ ...base, skill: 's1', severity: 'WARNING' }, { ...base, skill: 's2', severity: 'CRITICAL' }]);
  assert.equal(d.length, 1);
  assert.equal(d[0].severity, 'CRITICAL');
  assert.deepEqual(d[0].skills, ['s1', 's2']);

  const dis = (reason) => ({ skill: 'security', reason, title: 't' });
  assert.equal(dismissalHints([dis('Fastify escapes it'), dis('fastify  escapes it'), dis('other')]).length, 0);
  assert.equal(dismissalHints([dis('Fastify escapes it'), dis('fastify escapes it'), dis('FASTIFY escapes it')])[0].count, 3);
});
