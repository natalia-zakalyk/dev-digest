#!/usr/bin/env node
// Mark a finding as a false positive. The dismissal is appended to
// <state>/dismissals.jsonl (survives re-runs while the finding id stays the same),
// and report.json/report.md/pr-description.md are re-rendered with the new gate.
// Usage: node dismiss.mjs <finding id> "<reason>"
import { join } from 'node:path';
import { appendFileSync } from 'node:fs';
import { stateDir, readJson, writeAtomic, loadSkillMap, gateBlockers, fail } from './lib.mjs';
import { loadDismissals, dismissalHints, renderMarkdown, renderPrDescription } from './report-format.mjs';

const [id, reason] = process.argv.slice(2);
if (!id || !reason?.trim()) fail('dismiss', 'usage: dismiss.mjs <finding id> "<reason>"');

try {
  const state = stateDir();
  const report = readJson(join(state, 'report.json'));
  const finding = report.findings.find((f) => f.id === id);
  if (!finding) fail('dismiss', `no finding with id "${id}" in the current report`);

  const at = new Date().toISOString();
  appendFileSync(join(state, 'dismissals.jsonl'),
    JSON.stringify({ id, skill: finding.skill, title: finding.title, file: finding.file, severity: finding.severity, reason: reason.trim(), at }) + '\n');

  const dismissals = loadDismissals(state);
  report.findings = report.findings.map((f) => (dismissals.byId[f.id] ? { ...f, dismissed: dismissals.byId[f.id] } : f));
  const blockers = gateBlockers(report.findings, report.failOn);
  report.blockers = blockers.map((f) => f.id);
  report.verdict = blockers.length ? 'BLOCKED' : 'PASS';
  for (const s of Object.keys(report.counts)) report.counts[s] = report.findings.filter((f) => f.severity === s && !f.dismissed).length;
  report.dismissal_hints = dismissalHints(dismissals.all);

  writeAtomic(join(state, 'report.json'), JSON.stringify(report, null, 2));
  writeAtomic(join(state, 'report.md'), renderMarkdown(report));
  writeAtomic(join(state, 'pr-description.md'), renderPrDescription(report, loadSkillMap()));
  console.log(JSON.stringify({ dismissed: id, verdict: report.verdict, blockers: report.blockers, dismissal_hints: report.dismissal_hints }, null, 2));
} catch (err) {
  fail('dismiss', err.message);
}
