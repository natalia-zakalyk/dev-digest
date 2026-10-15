#!/usr/bin/env node
// Step 3: deterministic checks — no LLM, no network. Each problem becomes a Finding
// (skill "checks:<name>"). Secrets are reported by file:line and type only.
// Usage: node run-checks.mjs [--verify]  → writes <state>/checks.json, prints a summary
//   --verify  also run typecheck + unit tests in every changed module (slow)
import { join, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { repoRoot, stateDir, readJson, writeAtomic, loadSkillMap, matchesAny, fail } from './lib.mjs';

// Built from parts so this file never matches its own patterns.
const SECRET_PATTERNS = [
  ['Anthropic API key', new RegExp('sk-' + 'ant-[A-Za-z0-9_-]{20,}')],
  ['OpenAI-style API key', new RegExp('sk-' + '(?:proj-)?[A-Za-z0-9_-]{32,}')],
  ['GitHub token', new RegExp('gh[pousr]' + '_[A-Za-z0-9]{36,}')],
  ['GitHub fine-grained token', new RegExp('github' + '_pat_[A-Za-z0-9_]{50,}')],
  ['private key', new RegExp('-----BEGIN (?:[A-Z]+ )*' + 'PRIVATE KEY-----')],
];

const tail = (s, n = 15) => String(s ?? '').trim().split('\n').slice(-n).join('\n');

function sh(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const finding = (check, severity, category, file, line, title, rationale, suggestion) => ({
  skill: `checks:${check}`, severity, category, title, file, start_line: line, end_line: line,
  rationale, suggestion, confidence: 1, verified: true,
});

try {
  const verify = process.argv.includes('--verify');
  const root = repoRoot();
  const state = stateDir();
  const diff = readJson(join(state, 'diff.json'));
  const map = loadSkillMap();
  const findings = [];
  const notes = [];
  const present = diff.files.filter((f) => f.status !== 'D');
  const changed = (globs) => diff.files.some((f) => matchesAny(f.path, globs) || (f.old_path && matchesAny(f.old_path, globs)));

  // --- AGENTS.md "Do not touch" ------------------------------------------------
  for (const f of present) {
    const name = basename(f.path);
    if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
      findings.push(finding('do-not-touch', 'CRITICAL', 'security', f.path, 1, 'Env file in the diff',
        '.env files hold secrets and must never be committed (AGENTS.md → Do not touch).', `git rm --cached ${f.path} and keep it git-ignored.`));
    }
    if (name === 'secrets.json') {
      findings.push(finding('do-not-touch', 'CRITICAL', 'security', f.path, 1, 'secrets.json in the diff',
        'Secrets belong in ~/.devdigest/secrets.json, outside the repo (AGENTS.md → Do not touch).', 'Remove the file from the change.'));
    }
    if (f.path.startsWith('server/clones/')) {
      findings.push(finding('do-not-touch', 'CRITICAL', 'bug', f.path, 1, 'Imported repo checkout in the diff',
        'server/clones/ holds user repo checkouts and is git-ignored (AGENTS.md → Do not touch).', 'Drop these files from the change.'));
    }
    if (name === 'CLAUDE.md' || name === 'CLAUDE.local.md') {
      findings.push(finding('do-not-touch', 'CRITICAL', 'bug', f.path, 1, `${name} added`,
        'A CLAUDE.md in a directory or above silently disables AGENTS.md loading (INSIGHTS.md:20).', 'Put the instructions in AGENTS.md instead.'));
    }
  }

  // --- secrets in added lines ----------------------------------------------------
  for (const f of present) {
    if (!f.patch || !existsSync(f.patch)) continue;
    let newLine = 0;
    for (const line of readFileSync(f.patch, 'utf8').split('\n')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      if (hunk) { newLine = Number(hunk[1]); continue; }
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) {
        for (const [type, re] of SECRET_PATTERNS) {
          if (re.test(line)) {
            findings.push(finding('secrets', 'CRITICAL', 'security', f.path, newLine, `Possible ${type} in added line`,
              `An added line matches the ${type} pattern. The value is not shown here.`, 'Move it to server/.env or ~/.devdigest/secrets.json and rotate the key if it is real.'));
          }
        }
        newLine++;
      } else if (!line.startsWith('-')) newLine++;
    }
  }

  // --- applied migrations are immutable --------------------------------------------
  // drizzle-kit appends an entry to meta/_journal.json for every new migration — that's fine;
  // removing or rewriting existing entries is not.
  const appendOnly = (f) => f.status === 'M' && f.patch && existsSync(f.patch) && readFileSync(f.patch, 'utf8').split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('---')).every((l) => /^-\s*[}\]],?\s*$/.test(l));
  for (const f of diff.files) {
    const old = f.old_path ?? f.path;
    if (old === 'server/src/db/migrations/meta/_journal.json' && appendOnly(f)) continue;
    if (old.startsWith('server/src/db/migrations/') && (f.status === 'M' || f.status === 'D' || f.status === 'R')) {
      findings.push(finding('migrations', 'CRITICAL', 'bug', old, 1, 'Applied migration changed',
        'Never edit applied migrations — generate a new one (AGENTS.md → Do not touch).', 'Revert this file and run `cd server && pnpm db:generate`.'));
    }
  }

  // --- lock files change only via the package manager ------------------------------
  for (const f of diff.files) {
    const m = /^(server|client|reviewer-core|e2e)\/(pnpm-lock\.yaml|package-lock\.json)$/.exec(f.path);
    if (m && !diff.files.some((g) => g.path === `${m[1]}/package.json`)) {
      findings.push(finding('lockfile', 'CRITICAL', 'bug', f.path, 1, 'Lock file changed without package.json',
        'Lock files change only through the package manager when a dependency change was asked for (AGENTS.md → Do not touch).', `Revert ${f.path}, or make the dependency change with the package manager.`));
    }
  }

  // --- tests changed with the code -----------------------------------------------------
  for (const [module, cfg] of Object.entries(map.modules)) {
    const src = present.filter((f) => matchesAny(f.path, cfg.src) && !matchesAny(f.path, cfg.srcExclude));
    if (src.length && !changed(cfg.tests)) {
      findings.push(finding('tests', 'WARNING', 'test', src[0].path, 1, `No test changes in ${module}/`,
        `${src.length} source file(s) in ${module}/ changed, but none of its tests did (TESTING.md).`, `Add or update tests next to the change (${cfg.tests.join(', ')}).`));
    }
  }

  // --- dependency rule (server + reviewer-core) ----------------------------------------
  if (changed(['server/src/**', 'reviewer-core/src/**'])) {
    if (!existsSync(join(root, 'server/node_modules'))) {
      notes.push('lint:arch skipped — server/node_modules missing (cd server && pnpm install)');
    } else {
      const r = sh('pnpm -s lint:arch', join(root, 'server'));
      if (!r.ok) {
        findings.push(finding('lint-arch', 'CRITICAL', 'bug', 'server/.dependency-cruiser.cjs', 1, 'New dependency-rule violation (pnpm lint:arch)',
          tail(r.output), 'Fix the import (see the onion-architecture skill); never grow the known-violations baseline.'));
      } else notes.push('lint:arch passed');
    }
  }

  // --- both copies of @devdigest/shared ------------------------------------------------
  if (changed(['**/vendor/shared/**'])) {
    const script = join(root, 'scripts/check-shared-drift.sh');
    if (!existsSync(script)) notes.push('shared drift check skipped — scripts/check-shared-drift.sh missing');
    else {
      const r = sh(`"${script}"`, root);
      if (!r.ok) {
        findings.push(finding('shared-drift', 'CRITICAL', 'bug', 'server/src/vendor/shared', 1, '@devdigest/shared copies have drifted',
          tail(r.output), 'Apply the same change to server/src/vendor/shared and client/src/vendor/shared (AGENTS.md → Gotchas).'));
      } else notes.push('shared copies in sync');
    }
  }

  // --- --verify: typecheck + unit tests per changed module ------------------------------
  if (verify) {
    for (const [module, cfg] of Object.entries(map.modules)) {
      if (!diff.files.some((f) => f.module === module)) continue;
      if (!existsSync(join(root, module, 'node_modules'))) { notes.push(`${module}: verify skipped — node_modules missing`); continue; }
      for (const kind of ['typecheck', 'test']) {
        if (!cfg[kind]) continue;
        const r = sh(cfg[kind], join(root, module));
        if (r.ok) notes.push(`${module}: ${kind} passed`);
        else findings.push(finding(`verify-${kind}`, 'CRITICAL', kind === 'test' ? 'test' : 'bug', `${module}/package.json`, 1,
          `${module}: ${kind} failed`, tail(r.output, 25), `cd ${module} && ${cfg[kind]}`));
      }
    }
  }

  writeAtomic(join(state, 'checks.json'), JSON.stringify({ fingerprint: diff.fingerprint, findings, notes }, null, 2));
  console.log(JSON.stringify({
    findings: findings.map((f) => `${f.severity} ${f.skill} ${f.file}:${f.start_line} — ${f.title}`), notes,
  }, null, 2));
} catch (err) {
  fail('run-checks', err.message);
}
