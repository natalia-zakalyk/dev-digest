/**
 * Tiny helpers for the e2e runner. Assertions are intentionally minimal: most
 * of the "assert" work is done by agent-browser's own `wait --text` / `wait --url`
 * commands, which exit non-zero when the condition isn't met within the timeout.
 * These helpers only cover the extra substring checks and result bookkeeping.
 */

/** A single agent-browser invocation within a flow. */
export interface Step {
  /** agent-browser argv, e.g. ["wait", "--text", "#482"]. `{BASE}` is substituted. */
  cmd: string[];
  /** Human label for logs (defaults to the joined cmd). */
  label?: string;
  /** Optional extra check on the command's stdout (beyond its exit code). */
  assert?: { stdoutIncludes?: string };
}

export interface Flow {
  name: string;
  description?: string;
  steps: Step[];
}

export interface StepResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface FlowResult {
  name: string;
  ok: boolean;
  steps: StepResult[];
}

const FLOW_KEYS = new Set(["name", "description", "steps"]);
const STEP_KEYS = new Set(["cmd", "label", "assert"]);
const ASSERT_KEYS = new Set(["stdoutIncludes"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function unknownKeys(obj: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

/**
 * Validate a parsed `*.flow.json` (hand-written — e2e has no zod dependency).
 * Throws with every problem listed, so a malformed flow fails loudly instead of
 * being silently skipped: requires a name and >= 1 step, each step a non-empty
 * string[] `cmd`, and rejects unknown keys (a typo like `asert` would otherwise
 * be ignored and the check would never run).
 */
export function parseFlow(file: string, raw: unknown): Flow {
  const errors: string[] = [];
  if (!isObject(raw)) throw new Error(`Invalid flow ${file}: top level must be an object`);

  for (const k of unknownKeys(raw, FLOW_KEYS)) errors.push(`unknown key "${k}"`);
  if (typeof raw.name !== "string" || raw.name.trim() === "") errors.push(`"name" must be a non-empty string`);
  if (raw.description !== undefined && typeof raw.description !== "string") {
    errors.push(`"description" must be a string`);
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    errors.push(`"steps" must be a non-empty array (a flow needs at least one step)`);
  } else {
    raw.steps.forEach((step: unknown, i: number) => {
      const at = `steps[${i}]`;
      if (!isObject(step)) {
        errors.push(`${at} must be an object`);
        return;
      }
      for (const k of unknownKeys(step, STEP_KEYS)) errors.push(`${at}: unknown key "${k}"`);
      const cmd = step.cmd;
      if (!Array.isArray(cmd) || cmd.length === 0 || !cmd.every((a) => typeof a === "string")) {
        errors.push(`${at}.cmd must be a non-empty array of strings`);
      }
      if (step.label !== undefined && typeof step.label !== "string") errors.push(`${at}.label must be a string`);
      if (step.assert !== undefined) {
        if (!isObject(step.assert)) {
          errors.push(`${at}.assert must be an object`);
        } else {
          for (const k of unknownKeys(step.assert, ASSERT_KEYS)) errors.push(`${at}.assert: unknown key "${k}"`);
          const inc = step.assert.stdoutIncludes;
          if (inc !== undefined && typeof inc !== "string") errors.push(`${at}.assert.stdoutIncludes must be a string`);
        }
      }
    });
  }

  if (errors.length > 0) throw new Error(`Invalid flow ${file}:\n  - ${errors.join("\n  - ")}`);
  return raw as unknown as Flow;
}

/** Substitute `{BASE}` (and trim a trailing slash on BASE) in every arg. */
export function resolveArgs(cmd: string[], base: string): string[] {
  const b = base.replace(/\/+$/, "");
  return cmd.map((a) => a.replaceAll("{BASE}", b));
}

export function stdoutContains(stdout: string, needle: string): boolean {
  return stdout.includes(needle);
}

export function summarize(results: FlowResult[]): string {
  const lines: string[] = [];
  for (const f of results) {
    lines.push(`${f.ok ? "PASS" : "FAIL"}  ${f.name}`);
    for (const s of f.steps) {
      if (!s.ok) lines.push(`        ✗ ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
    }
  }
  const passed = results.filter((r) => r.ok).length;
  lines.push("");
  lines.push(`${passed}/${results.length} flows passed`);
  return lines.join("\n");
}
