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
import { isPrivateIp, validateDocUrl, validateSkillUrl } from './validate.js';

export { validateSkillUrl, validateDocUrl, validateGithubContentUrl, isPrivateIp, ALLOWED_HOSTS } from './validate.js';

export const MAX_BYTES = 2 * 1024 * 1024;
/** Linked plan/spec docs are small text files: a much smaller cap than skill zips. */
export const DOC_MAX_BYTES = 256 * 1024;
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
  /** URL validator applied to the input and every redirect hop. Defaults to `validateSkillUrl`. */
  validate?: (input: string) => URL;
  /** Accepted response content types. Defaults to the skill set (md/text/zip). */
  allowedTypes?: readonly string[];
  /** Message prefix and size wording. Default to the skill-import wording. */
  label?: string;
  maxLabel?: string;
}

/** Options for the doc fetcher used by the intent layer (text docs only, small cap). */
export const DOC_FETCHER_OPTIONS: SafeHttpsFetcherOptions = {
  validate: validateDocUrl,
  allowedTypes: ['text/plain', 'text/markdown', 'text/x-markdown', 'application/octet-stream'],
  label: 'Doc URL',
  maxBytes: DOC_MAX_BYTES,
  maxLabel: '256 KB',
};

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

export class SafeHttpsFetcher implements UrlFetcher {
  private fetchImpl: typeof fetch;
  private resolveHost: (host: string) => Promise<string[]>;
  private maxBytes: number;
  private timeoutMs: number;
  private maxRedirects: number;
  private validate: (input: string) => URL;
  private allowedTypes: readonly string[];
  private label: string;
  private maxLabel: string;

  constructor(opts: SafeHttpsFetcherOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.resolveHost = opts.resolveHost ?? defaultResolve;
    this.maxBytes = opts.maxBytes ?? MAX_BYTES;
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    this.maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
    this.validate = opts.validate ?? validateSkillUrl;
    this.allowedTypes = opts.allowedTypes ?? ALLOWED_TYPES;
    this.label = opts.label ?? 'Skill URL';
    this.maxLabel = opts.maxLabel ?? '2 MB';
  }

  async fetch(input: string): Promise<UrlFetchResult> {
    let url = this.validate(input);
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
        if (!location) throw new ValidationError(`${this.label} rejected: redirect without a location`);
        // Re-validate every hop: a redirect must never leave the allowlist or downgrade to http.
        url = this.validate(new URL(location, url).href);
        continue;
      }
      if (res.status !== 200) throw new ValidationError(`${this.label} could not be fetched (HTTP ${res.status})`);

      const contentType = res.headers.get('content-type');
      const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
      if (!mime || !this.allowedTypes.includes(mime)) {
        throw new ValidationError(`${this.label} rejected: unsupported content type "${mime ?? 'unknown'}"`);
      }
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > this.maxBytes) throw new ValidationError(`${this.label} rejected: file is too large (max ${this.maxLabel})`);

      const bytes = await this.readCapped(res);
      if (url.pathname.toLowerCase().endsWith('.zip') && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        throw new ValidationError(`${this.label} rejected: the file is not a valid zip archive`);
      }
      return { bytes, contentType, finalUrl: url.href };
    }
    throw new ValidationError(`${this.label} rejected: too many redirects`);
  }

  private async assertPublicHost(host: string): Promise<void> {
    let addrs: string[];
    try {
      addrs = await this.resolveHost(host);
    } catch {
      throw new ValidationError(`${this.label} rejected: cannot resolve host "${host}"`);
    }
    if (addrs.length === 0 || addrs.some(isPrivateIp)) {
      throw new ValidationError(`${this.label} rejected: the host resolves to a non-public address`);
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
    throw new ValidationError(`${this.label} rejected: file is too large (max ${this.maxLabel})`);
  }
}
