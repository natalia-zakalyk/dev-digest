import { ValidationError } from '../../platform/errors.js';

/**
 * Skill import by URL — the only outbound call that is not GitHub's API or an LLM provider, so it is
 * pinned to GitHub's content hosts. Everything here is pure (no I/O) so it is unit-testable offline.
 * Mirrors the parse-and-rebuild approach of repos/helpers.ts (`parseRepoUrl`).
 */

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'github.com',
]);

/** Extensions a skill file may have (the importer reads `.md` or a zip with `SKILL.md`). */
export const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.zip'] as const;

const reject = (why: string): never => {
  throw new ValidationError(`Skill URL rejected: ${why}`);
};

/**
 * Validate a user-supplied skill URL and return the URL to actually request.
 * `github.com/<o>/<r>/blob|raw/<ref>/<path>` is rewritten to `raw.githubusercontent.com/<o>/<r>/<ref>/<path>`.
 */
export function validateSkillUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return reject('not a valid URL');
  }
  if (url.protocol !== 'https:') reject('only https:// URLs are allowed');
  if (url.username || url.password) reject('credentials in the URL are not allowed');
  if (url.port && url.port !== '443') reject('custom ports are not allowed');
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return reject(`host "${host}" is not allowed (use raw.githubusercontent.com, gist.githubusercontent.com or github.com)`);
  }

  let target = new URL(url.href);
  target.hash = '';
  target.search = '';
  if (host === 'github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    if (!m) return reject('github.com URLs must look like /owner/repo/blob/<ref>/<path>');
    target = new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  }

  let path: string;
  try {
    path = decodeURIComponent(target.pathname).toLowerCase();
  } catch {
    // A malformed %-escape (e.g. "%zz") parses as a URL but cannot be decoded — a 422, not a 500.
    return reject('the path contains an invalid %-escape');
  }
  if (!ALLOWED_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    reject('only .md or .zip files can be imported');
  }
  return target;
}

/** Private / loopback / link-local / unspecified addresses (IPv4 + IPv6). */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]!);
  if (v.includes(':')) {
    return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
