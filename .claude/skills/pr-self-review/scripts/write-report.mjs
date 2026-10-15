#!/usr/bin/env node
// Step 7: merge LLM findings (<state>/findings/<batch id>.json), cached findings and
// deterministic checks; validate, dedupe, apply dismissals, compute the gate and
// write report.json + report.md + pr-description.md. Refreshes the review cache.
// Usage: node write-report.mjs   → exit 0 PASS, exit 3 BLOCKED, exit 1 invalid input
import { join } from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  stateDir, readJson, writeAtomic, loadSkillMap, normalizeSeverity, gateBlockers, sha, fail,
  worktreeChanges, worktreeBlobs, touchedPaths, fingerprint, mergeBase, SEV_RANK, CATEGORIES,
} from './lib.mjs';
import { loadDismissals, dismissalHints, renderMarkdown, renderPrDescription } from './report-format.mjs';

const TAG = 'write-report';

/** Validate + normalize one finding; returns [finding, error]. */
export function normalizeFinding(raw, { skill, allowedFiles, skillMap, requireVerifiedCritical }) {
  if (!raw || typeof raw !== 'object') return [null, 'not an object'];
  const severity = normalizeSeverity(raw.severity, skillMap);
  if (!severity) return [null, `unknown severity "${raw.severity}"`];
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'style';
  for (const k of ['title', 'file', 'rationale']) if (typeof raw[k] !== 'string' || !raw[k].trim()) return [null, `missing ${k}`];
  if (allowedFiles && !allowedFiles.has(raw.file)) return [null, `file "${raw.file}" is not part of this batch`];
  const start = Number.isInteger(raw.start_line) && raw.start_line >= 0 ? raw.start_line : 1;
  const end = Number.isInteger(raw.end_line) && raw.end_line >= start ? raw.end_line : start;
  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5;
  if (severity === 'CRITICAL' && requireVerifiedCritical && raw.verified !== true) {
    return [null, `CRITICAL "${raw.title}" was not verified (run the refutation step, then set "verified": true)`];
  }
  return [{
    skill: raw.skill ?? skill, severity, category, title: raw.title.trim(), file: raw.file,
    start_line: start, end_line: end, rationale: raw.rationale.trim(),
    suggestion: typeof raw.suggestion === 'string' ? raw.suggestion : undefined,
    confidence, verified: raw.verified === true, ...(raw.verification ? { verification: String(raw.verification) } : {}),
  }, null];
}

/** Stable id (survives line shifts) + dedupe on file/line/title keeping the worst severity. */
export function dedupe(findings) {
  const byKey = new Map();
  for (const f of findings) {
    const key = `${f.file}|${f.start_line}|${f.title.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...f, skills: [f.skill] }); continue; }
    if (!prev.skills.includes(f.skill)) prev.skills.push(f.skill);
    if (SEV_RANK[f.severity] > SEV_RANK[prev.severity]) Object.assign(prev, { ...f, skills: prev.skills });
  }
  const seen = new Map();
  return [...byKey.values()].map((f) => {
    let id = sha(`${f.skill}|${f.file}|${f.title.toLowerCase()}`, 8);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n + 1}`;
    return { id, ...f };
  }).sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.file.localeCompare(b.file) || a.start_line - b.start_line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const state = stateDir();
    const map = loadSkillMap();
    const diff = readJson(join(state, 'diff.json'));
    const batches = readJson(join(state, 'batches.json'));
    const checks = readJson(join(state, 'checks.json'));

    if (batches.fingerprint !== diff.fingerprint || checks.fingerprint !== diff.fingerprint) {
      fail(TAG, 'diff.json, batches.json and checks.json are from different runs — rerun the whole review');
    }
    // The tree must not change between collect-diff and now, or the report would vouch for unseen code.
    const files = worktreeChanges(mergeBase('HEAD'));
    if (fingerprint(worktreeBlobs(touchedPaths(files))) !== diff.fingerprint) {
      fail(TAG, 'the working tree changed during the review — rerun from collect-diff.mjs');
    }

    const errors = [];
    const llm = [];
    const newCache = {};
    for (const b of batches.batches) {
      const file = join(batches.findings_dir, `${b.id}.json`);
      if (!existsSync(file)) { errors.push(`${b.id}: missing ${file}`); continue; }
      let data;
      try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { errors.push(`${b.id}: invalid JSON (${e.message})`); continue; }
      const list = Array.isArray(data) ? data : data.findings;
      if (!Array.isArray(list)) { errors.push(`${b.id}: expected an array of findings`); continue; }
      const allowed = new Set(b.files.map((f) => f.path));
      const perFile = Object.fromEntries(b.files.map((f) => [f.path, []]));
      list.forEach((raw, i) => {
        const [f, err] = normalizeFinding(raw, { skill: b.skill, allowedFiles: allowed, skillMap: map, requireVerifiedCritical: true });
        if (err) errors.push(`${b.id}[${i}]: ${err}`);
        else { f.skill = b.skill; llm.push(f); perFile[f.file].push(f); }
      });
      for (const f of b.files) newCache[f.cache_key] = perFile[f.path];
    }
    if (errors.length) fail(TAG, `invalid findings — nothing written:\n  ${errors.join('\n  ')}`);

    // Keep only cache entries for contents that are still in the diff.
    const live = new Set(diff.files.map((f) => `${f.path}|${f.blob}`));
    const oldCache = readJson(join(state, 'cache.json'), {});
    const cache = {};
    for (const [k, v] of Object.entries({ ...oldCache, ...newCache })) {
      const [, path, blob] = k.split('|');
      if (live.has(`${path}|${blob}`)) cache[k] = v;
    }

    const dismissals = loadDismissals(state);
    const findings = dedupe([...llm, ...batches.cached, ...checks.findings]).map((f) =>
      dismissals.byId[f.id] ? { ...f, dismissed: dismissals.byId[f.id] } : f);
    const failOn = map.failOn;
    const blockers = gateBlockers(findings, failOn);

    const report = {
      version: 1,
      generated_at: new Date().toISOString(),
      base: diff.base, head: diff.head, fingerprint: diff.fingerprint, failOn,
      verdict: blockers.length ? 'BLOCKED' : 'PASS',
      blockers: blockers.map((f) => f.id),
      counts: Object.fromEntries(['CRITICAL', 'WARNING', 'SUGGESTION'].map((s) => [s, findings.filter((f) => f.severity === s && !f.dismissed).length])),
      findings,
      coverage: batches.coverage, unreviewed: batches.unreviewed, skipped: batches.skipped,
      check_notes: checks.notes, routing_warnings: batches.warnings,
      dismissal_hints: dismissalHints(dismissals.all),
      files: diff.files.map(({ path, old_path, status, module, additions, deletions }) => ({ path, old_path, status, module, additions, deletions })),
    };

    writeAtomic(join(state, 'cache.json'), JSON.stringify(cache, null, 2));
    writeAtomic(join(state, 'report.json'), JSON.stringify(report, null, 2));
    writeAtomic(join(state, 'report.md'), renderMarkdown(report));
    writeAtomic(join(state, 'pr-description.md'), renderPrDescription(report, map));

    console.log(JSON.stringify({
      verdict: report.verdict, failOn, counts: report.counts, blockers: report.blockers,
      unreviewed: report.unreviewed.length, dismissal_hints: report.dismissal_hints,
      report: join(state, 'report.md'), pr_description: join(state, 'pr-description.md'),
    }, null, 2));
    process.exit(blockers.length ? 3 : 0);
  } catch (err) {
    fail(TAG, err.message);
  }
}
