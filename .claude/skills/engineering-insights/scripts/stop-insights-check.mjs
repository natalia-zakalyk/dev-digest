#!/usr/bin/env node
// Stop hook: makes the engineering-insights end-of-session check happen in every
// substantive session without being asked. Blocks the FIRST stop of a session
// that has uncommitted changes, telling Claude to run SKILL.md steps 6–7; never
// loops (stop_hook_active) and fires at most once per session (marker file).
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  if (input.stop_hook_active) process.exit(0); // already continuing because of us

  const dir = join(tmpdir(), 'devdigest-insights-check');
  const marker = join(dir, String(input.session_id ?? 'unknown'));
  if (existsSync(marker)) process.exit(0); // asked once this session already

  let changed = '';
  try {
    changed = execSync('git status --porcelain', { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8' });
  } catch { process.exit(0); }
  if (!changed.trim()) process.exit(0); // no work done → nothing to capture

  mkdirSync(dir, { recursive: true });
  writeFileSync(marker, new Date().toISOString());
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      'engineering-insights end-of-session check (.claude/skills/engineering-insights/SKILL.md steps 6–7): ' +
      're-read the INSIGHTS.md of every module you touched, record only new and substantial insights via ' +
      'append-insight.mjs (each with a date and file:line), then end your reply with what you recorded or ' +
      '"No new insights — <why>".',
  }));
});
