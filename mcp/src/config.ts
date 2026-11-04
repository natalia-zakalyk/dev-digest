import { z } from 'zod';
import { DEFAULT_RUN_WAIT_MS, MAX_RUN_WAIT_MS } from './constants.js';
import { InvalidBaseUrl } from './errors.js';
import { originOf } from './shape/text.js';

/** Pure startup config: env parsing and the loopback guard. No I/O, no process access. */

export const DEFAULT_API_BASE = 'http://localhost:3001';

/** Hostnames as `URL.hostname` reports them (IPv6 keeps its brackets). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface Config {
  baseUrl: string;
  runWaitMs: number;
}

/** Plain decimal digits only: no `1e3`, `0x10`, `Infinity`, signs or fractions. */
const RunWaitMs = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(MAX_RUN_WAIT_MS));

export function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Throws `InvalidBaseUrl` for a non-loopback (or unparsable) base unless `allowRemote`. */
export function assertLoopback(url: string, allowRemote: boolean): void {
  if (!allowRemote && !isLoopbackUrl(url)) throw new InvalidBaseUrl(originOf(url));
}

/**
 * Throws `InvalidBaseUrl('malformed')` unless `url` is a plain `http(s)://host[:port][/path]`: no other
 * scheme, no username/password (they would be sent with every request and show up in logs), no query, no hash.
 */
export function assertPlainHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidBaseUrl('<invalid url>', 'malformed');
  }
  const plain =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    !parsed.username &&
    !parsed.password &&
    !parsed.search &&
    !parsed.hash;
  if (!plain) throw new InvalidBaseUrl(parsed.origin, 'malformed');
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const baseUrl = (env.DEVDIGEST_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
  assertPlainHttpUrl(baseUrl);
  assertLoopback(baseUrl, env.DEVDIGEST_ALLOW_REMOTE === '1');

  const rawWait = env.MCP_RUN_WAIT_MS?.trim();
  const parsed = rawWait ? RunWaitMs.safeParse(rawWait) : undefined;
  if (parsed && !parsed.success) {
    throw new Error(`MCP_RUN_WAIT_MS must be a positive integer of milliseconds (max ${MAX_RUN_WAIT_MS}), got "${rawWait}".`);
  }
  return { baseUrl, runWaitMs: parsed?.data ?? DEFAULT_RUN_WAIT_MS };
}
