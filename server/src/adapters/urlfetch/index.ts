/**
 * urlfetch adapter — downloads a skill file (`.md` / `.zip`) from an allow-listed GitHub host.
 *
 * Safety rules (specs/skills.md § Import by URL): https only, exact host allowlist, no credentials
 * (the GitHub token is never sent), redirects are followed MANUALLY (≤ 3) and every hop is re-validated,
 * a hard timeout, a streamed byte cap (Content-Length is not trusted), content-type + magic-byte checks,
 * and resolved addresses must not be private/loopback/link-local. The allowlist is the main defence; the IP
 * check is belt-and-braces (it cannot close a DNS-rebinding race without a pinned dispatcher).
 */
import { lookup } from 'node:dns/promises';
import type { UrlFetcher, UrlFetchResult } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { isPrivateIp, validateSkillUrl } from './validate.js';

export { validateSkillUrl, isPrivateIp, ALLOWED_HOSTS } from './validate.js';

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;

const ALLOWED_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];

export interface SafeHttpsFetcherOptions {
  /** Injected in tests so nothing touches the network. */
  fetchImpl?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

export class SafeHttpsFetcher implements UrlFetcher {
  private fetchImpl: typeof fetch;
  private resolveHost: (host: string) => Promise<string[]>;
  private maxBytes: number;
  private timeoutMs: number;
  private maxRedirects: number;

  constructor(opts: SafeHttpsFetcherOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.resolveHost = opts.resolveHost ?? defaultResolve;
    this.maxBytes = opts.maxBytes ?? MAX_BYTES;
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    this.maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  }

  async fetch(input: string): Promise<UrlFetchResult> {
    let url = validateSkillUrl(input);
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      await this.assertPublicHost(url.hostname);
      const res = await this.fetchImpl(url.href, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'text/markdown, text/plain, application/zip;q=0.9', 'user-agent': 'devdigest-skill-import' },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new ValidationError('Skill URL rejected: redirect without a location');
        // Re-validate every hop: a redirect must never leave the allowlist or downgrade to http.
        url = validateSkillUrl(new URL(location, url).href);
        continue;
      }
      if (res.status !== 200) throw new ValidationError(`Skill URL could not be fetched (HTTP ${res.status})`);

      const contentType = res.headers.get('content-type');
      const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
      if (!mime || !ALLOWED_TYPES.includes(mime)) {
        throw new ValidationError(`Skill URL rejected: unsupported content type "${mime ?? 'unknown'}"`);
      }
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > this.maxBytes) throw new ValidationError('Skill URL rejected: file is too large (max 2 MB)');

      const bytes = await this.readCapped(res);
      if (url.pathname.toLowerCase().endsWith('.zip') && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        throw new ValidationError('Skill URL rejected: the file is not a valid zip archive');
      }
      return { bytes, contentType, finalUrl: url.href };
    }
    throw new ValidationError('Skill URL rejected: too many redirects');
  }

  private async assertPublicHost(host: string): Promise<void> {
    let addrs: string[];
    try {
      addrs = await this.resolveHost(host);
    } catch {
      throw new ValidationError(`Skill URL rejected: cannot resolve host "${host}"`);
    }
    if (addrs.length === 0 || addrs.some(isPrivateIp)) {
      throw new ValidationError('Skill URL rejected: the host resolves to a non-public address');
    }
  }

  /** Stream the body and abort as soon as the cap is exceeded. */
  private async readCapped(res: Response): Promise<Uint8Array> {
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > this.maxBytes) return this.tooLarge();
      return buf;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel();
        return this.tooLarge();
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }

  private tooLarge(): never {
    throw new ValidationError('Skill URL rejected: file is too large (max 2 MB)');
  }
}
