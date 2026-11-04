import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');

/** Children started by the current test; killed in `afterEach` so a failed test cannot leak one. */
const started: Array<ReturnType<typeof spawn>> = [];
afterEach(() => {
  for (const c of started.splice(0)) if (c.exitCode === null) c.kill('SIGKILL');
});

function start(env: Record<string, string>) {
  const child = spawn(TSX, ['src/index.ts'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  started.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  );
  const waitFor = async (text: string, ms = 15_000) => {
    const end = Date.now() + ms;
    while (!stderr.includes(text)) {
      if (Date.now() > end) throw new Error(`timeout waiting for "${text}"; stderr: ${stderr}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return { child, exited, waitFor, out: () => ({ stdout, stderr }) };
}

describe('entry point (npx tsx src/index.ts, offline)', () => {
  it('starts with an unreachable API, writes nothing to stdout, exits fast on SIGTERM', async () => {
    const p = start({ DEVDIGEST_API_BASE: 'http://127.0.0.1:1' });
    await p.waitFor('ready');
    const t0 = Date.now();
    p.child.kill('SIGTERM');
    const { code } = await p.exited;
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(code).toBe(0);
    expect(p.out().stdout).toBe('');
  }, 30_000);

  it('refuses a non-loopback base: stderr message, exit code 1, empty stdout', async () => {
    const p = start({ DEVDIGEST_API_BASE: 'http://example.com' });
    const { code } = await p.exited;
    expect(code).toBe(1);
    expect(p.out().stderr).toContain('DEVDIGEST_API_BASE must be a loopback address');
    expect(p.out().stdout).toBe('');
  }, 30_000);
});
