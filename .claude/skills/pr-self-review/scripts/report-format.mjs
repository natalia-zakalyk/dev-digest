// Rendering + dismissal bookkeeping shared by write-report.mjs and dismiss.mjs.
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const EMOJI = { CRITICAL: '🔴', WARNING: '🟡', SUGGESTION: '🔵' };
const HINT_THRESHOLD = 3;

/** dismissals.jsonl → { all: [...], byId: { id → latest dismissal } } */
export function loadDismissals(state) {
  const file = join(state, 'dismissals.jsonl');
  const all = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const byId = {};
  for (const d of all) byId[d.id] = { reason: d.reason, at: d.at };
  return { all, byId };
}

/** Same skill dismissed ≥3 times for the same reason → suggest fixing the lens, not the code. */
export function dismissalHints(all) {
  const groups = {};
  for (const d of all) {
    const key = `${d.skill}|${String(d.reason).toLowerCase().replace(/\s+/g, ' ').trim()}`;
    (groups[key] ??= []).push(d);
  }
  return Object.values(groups).filter((g) => g.length >= HINT_THRESHOLD).map((g) => ({
    skill: g[0].skill, reason: g[0].reason, count: g.length, titles: [...new Set(g.map((d) => d.title))].slice(0, 5),
    suggestion: `Tighten rubric.md / skill-map.json for "${g[0].skill}", or record the rule in the module's INSIGHTS.md via append-insight.mjs (with file:line).`,
  }));
}

const loc = (f) => (f.start_line > 1 || f.end_line > 1 ? `${f.file}:${f.start_line}${f.end_line > f.start_line ? `-${f.end_line}` : ''}` : f.file);
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');

export function renderMarkdown(r) {
  const out = [];
  const unreviewedNote = r.unreviewed.length ? `, ${r.unreviewed.length} file(s) not reviewed` : '';
  out.push(`# PR self-review — ${r.verdict === 'PASS' ? '✅ PASS' : `⛔ BLOCKED (${r.blockers.length} ${r.failOn === 'critical' ? 'critical' : `≥ ${r.failOn}`})`}${unreviewedNote}`);
  out.push('', `base \`${r.base.slice(0, 10)}\` · head \`${r.head.slice(0, 10)}\` · fingerprint \`${r.fingerprint.slice(0, 12)}\` · failOn \`${r.failOn}\` · ${r.generated_at}`);
  out.push('', `🔴 ${r.counts.CRITICAL} critical · 🟡 ${r.counts.WARNING} warning · 🔵 ${r.counts.SUGGESTION} suggestion`);

  for (const sev of ['CRITICAL', 'WARNING', 'SUGGESTION']) {
    const list = r.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push('', `## ${EMOJI[sev]} ${sev} (${list.length})`, '');
    for (const f of list) {
      out.push(`- **${f.title}** — \`${loc(f)}\` · ${f.skills?.join(', ') ?? f.skill} · id \`${f.id}\`${f.dismissed ? ` · ~~dismissed~~: ${oneLine(f.dismissed.reason)}` : ''}`);
      out.push(`  ${oneLine(f.rationale)}`);
      if (f.suggestion) out.push(`  → ${oneLine(f.suggestion)}`);
    }
  }

  out.push('', '## Coverage', '', '| File | Reviewed by |', '|---|---|');
  for (const [path, skills] of Object.entries(r.coverage)) out.push(`| \`${path}\` | ${skills.join(', ')} |`);
  if (r.unreviewed.length) {
    out.push('', `### ⚠️ Not reviewed (${r.unreviewed.length}) — no skill matches these files`, '');
    for (const p of r.unreviewed) out.push(`- \`${p}\``);
  }
  if (r.skipped.length) {
    out.push('', `### Skipped (${r.skipped.length})`, '');
    for (const s of r.skipped) out.push(`- \`${s.path}\` — ${s.reason}`);
  }
  if (r.check_notes.length) out.push('', '## Deterministic checks', '', ...r.check_notes.map((n) => `- ${n}`));
  if (r.routing_warnings.length) out.push('', '## Routing warnings', '', ...r.routing_warnings.map((w) => `- ${w}`));
  if (r.dismissal_hints.length) {
    out.push('', '## Repeated false positives', '');
    for (const h of r.dismissal_hints) out.push(`- **${h.skill}** dismissed ${h.count}× for "${oneLine(h.reason)}" → ${h.suggestion}`);
  }
  return out.join('\n') + '\n';
}

export function renderPrDescription(r, map) {
  const modules = {};
  for (const f of r.files) {
    const m = (modules[f.module] ??= { A: 0, M: 0, D: 0, R: 0, add: 0, del: 0 });
    m[f.status in m ? f.status : 'M']++;
    m.add += f.additions ?? 0;
    m.del += f.deletions ?? 0;
  }
  const out = ['## Summary', '', '<!-- one or two sentences: what and why -->', '', '### Changes by module', '',
    '| Module | Added | Modified | Renamed | Deleted | Lines |', '|---|---|---|---|---|---|'];
  for (const [name, m] of Object.entries(modules).sort()) {
    out.push(`| \`${name === 'root' ? '/' : `${name}/`}\` | ${m.A} | ${m.M} | ${m.R} | ${m.D} | +${m.add} / −${m.del} |`);
  }

  const risks = r.findings.filter((f) => f.severity === 'WARNING' && !f.dismissed);
  const dismissedCritical = r.findings.filter((f) => f.severity === 'CRITICAL' && f.dismissed);
  out.push('', '## Risks & open review notes', '');
  if (!risks.length && !dismissedCritical.length) out.push('- None flagged by the self-review.');
  for (const f of dismissedCritical) out.push(`- 🔴 dismissed: **${f.title}** (\`${loc(f)}\`) — ${oneLine(f.dismissed.reason)}`);
  for (const f of risks) out.push(`- 🟡 **${f.title}** (\`${loc(f)}\`)`);
  if (r.unreviewed.length) out.push(`- ⚠️ Not covered by any review skill: ${r.unreviewed.map((p) => `\`${p}\``).join(', ')}`);

  out.push('', '## How to verify', '', '```bash');
  for (const name of Object.keys(modules).sort()) {
    const cfg = map.modules[name];
    if (!cfg) continue;
    out.push(`cd ${name} && ${[cfg.typecheck, cfg.test].filter(Boolean).join(' && ')} && cd ..`);
  }
  if (modules.server || modules['reviewer-core']) out.push('cd server && pnpm lint:arch && cd ..');
  out.push('```');
  out.push('', `Self-review: ${r.verdict} (failOn \`${r.failOn}\`, 🔴 ${r.counts.CRITICAL} · 🟡 ${r.counts.WARNING} · 🔵 ${r.counts.SUGGESTION}, fingerprint \`${r.fingerprint.slice(0, 12)}\`)`);
  out.push('', '🤖 Generated with [Claude Code](https://claude.com/claude-code)');
  return out.join('\n') + '\n';
}
