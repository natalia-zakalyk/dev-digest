#!/usr/bin/env node
// Step 2: map changed files to project skills (skill-map.json) and split the work
// into review batches {skill, module, files}. Pairs (skill, file) whose content was
// already reviewed under the same skill/rubric version come from the cache instead.
// Usage: node route-skills.mjs [--full]  → writes <state>/batches.json, prints a summary
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import {
  SKILL_DIR, repoRoot, stateDir, readJson, writeAtomic, loadSkillMap, matchesAny, sha, fail,
} from './lib.mjs';

try {
  const full = process.argv.includes('--full');
  const root = repoRoot();
  const state = stateDir();
  const diff = readJson(join(state, 'diff.json'));
  const map = loadSkillMap();
  const cache = full ? {} : readJson(join(state, 'cache.json'), {});

  // Every installed skill must be routed or explicitly ignored, so a new skill
  // can't silently fall out of the review.
  const skillsDir = join(root, '.claude/skills');
  const installed = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, 'SKILL.md'))).map((d) => d.name)
    : [];
  const routed = new Set(map.rules.flatMap((r) => r.skills));
  const warnings = [];
  for (const s of installed) {
    if (!routed.has(s) && !(s in map.ignoreSkills)) warnings.push(`skill "${s}" is not in skill-map.json (add it to a rule or to ignoreSkills)`);
  }
  for (const s of routed) {
    if (!installed.includes(s)) warnings.push(`skill-map.json routes to "${s}", but .claude/skills/${s}/SKILL.md does not exist — skipped`);
  }

  // Cache key part that changes whenever the lens itself changes.
  const shared = readFileSync(join(SKILL_DIR, 'rubric.md'), 'utf8') + readFileSync(join(SKILL_DIR, 'skill-map.json'), 'utf8');
  const lensVersion = {};
  const lens = (skill) => (lensVersion[skill] ??= sha(shared + readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8'), 16));

  const coverage = {}; // path → skills
  const skipped = []; // {path, reason}
  const unreviewed = []; // paths no rule matched
  const pending = {}; // skill → module → files
  const cached = []; // findings reused from cache
  let cachedPairs = 0;

  for (const f of diff.files) {
    if (f.status === 'D') { skipped.push({ path: f.path, reason: 'deleted' }); continue; }
    if (f.binary) { skipped.push({ path: f.path, reason: 'binary' }); continue; }
    if (matchesAny(f.path, map.ignorePaths)) { skipped.push({ path: f.path, reason: 'ignorePaths' }); continue; }
    const skills = [...new Set(map.rules
      .filter((r) => matchesAny(f.path, r.globs) && !matchesAny(f.path, r.exclude))
      .flatMap((r) => r.skills))]
      .filter((s) => installed.includes(s));
    if (!skills.length) { unreviewed.push(f.path); continue; }
    coverage[f.path] = skills;
    for (const skill of skills) {
      const key = `${skill}|${f.path}|${f.blob}|${lens(skill)}`;
      if (cache[key]) { cached.push(...cache[key]); cachedPairs++; continue; }
      ((pending[skill] ??= {})[f.module] ??= []).push({ path: f.path, status: f.status, patch: f.patch, blob: f.blob, cache_key: key });
    }
  }

  const batches = [];
  for (const [skill, byModule] of Object.entries(pending)) {
    for (const [module, files] of Object.entries(byModule)) {
      for (let i = 0; i < files.length; i += map.batchSize) {
        const n = i / map.batchSize + 1;
        batches.push({
          id: `${skill}--${module}--${n}`,
          skill,
          skill_md: join(skillsDir, skill, 'SKILL.md'),
          module,
          module_docs: ['AGENTS.md', 'INSIGHTS.md'].map((d) => join(root, module === 'root' ? '' : module, d)).filter(existsSync),
          files: files.slice(i, i + map.batchSize),
        });
      }
    }
  }

  // Fresh findings dir for this run: one <batch id>.json per batch, written by Claude.
  rmSync(join(state, 'findings'), { recursive: true, force: true });

  const out = {
    fingerprint: diff.fingerprint, failOn: map.failOn, rubric: join(SKILL_DIR, 'rubric.md'),
    findings_dir: join(state, 'findings'), batches, cached, coverage, skipped, unreviewed, warnings,
  };
  writeAtomic(join(state, 'batches.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    batches: batches.map((b) => `${b.id} (${b.files.length} files)`),
    cached_pairs: cachedPairs, cached_findings: cached.length,
    unreviewed, skipped: skipped.length, warnings,
  }, null, 2));
} catch (err) {
  fail('route-skills', err.message);
}
