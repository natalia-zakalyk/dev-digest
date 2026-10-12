import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { SafeHttpsFetcher, validateSkillUrl, isPrivateIp } from '../src/adapters/urlfetch/index.js';
import { MockUrlFetcher } from '../src/adapters/mocks.js';
import { filenameFromUrl } from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

/** Skill import by URL — hermetic: the fetcher gets an injected fetch + resolver, nothing touches the network. */

const OK_URL = 'https://raw.githubusercontent.com/org/repo/main/skill.md';
const PUBLIC = async () => ['185.199.108.133'];

const resp = (body: BodyInit | null, init: ResponseInit & { type?: string } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { 'content-type': init.type ?? 'text/plain', ...(init.headers as object) } });

const fetcher = (impl: (url: string) => Response | Promise<Response>, over: ConstructorParameters<typeof SafeHttpsFetcher>[0] = {}) =>
  new SafeHttpsFetcher({ fetchImpl: ((u: string) => Promise.resolve(impl(u))) as unknown as typeof fetch, resolveHost: PUBLIC, ...over });

describe('validateSkillUrl', () => {
  it('accepts the allowed GitHub hosts and rewrites github.com blob/raw links', () => {
    expect(validateSkillUrl(OK_URL).href).toBe(OK_URL);
    expect(validateSkillUrl('https://gist.githubusercontent.com/u/abc/raw/rev/skill.md').hostname).toBe('gist.githubusercontent.com');
    expect(validateSkillUrl('https://github.com/org/repo/blob/main/skills/x.md').href).toBe(
      'https://raw.githubusercontent.com/org/repo/main/skills/x.md',
    );
    expect(validateSkillUrl('https://github.com/org/repo/raw/v1/s.zip').href).toBe('https://raw.githubusercontent.com/org/repo/v1/s.zip');
  });

  it.each([
    ['http scheme', 'http://raw.githubusercontent.com/o/r/main/s.md'],
    ['other host', 'https://evil.example/o/r/main/s.md'],
    ['lookalike host', 'https://raw.githubusercontent.com.evil.example/o/r/main/s.md'],
    ['host in path', 'https://evil.example/raw.githubusercontent.com/o/r/main/s.md'],
    ['userinfo', 'https://user:pw@raw.githubusercontent.com/o/r/main/s.md'],
    ['custom port', 'https://raw.githubusercontent.com:8443/o/r/main/s.md'],
    ['file scheme', 'file:///etc/passwd'],
    ['ip literal', 'https://169.254.169.254/latest/meta-data/s.md'],
    ['not a url', 'raw.githubusercontent.com/o/r/main/s.md'],
    ['wrong extension', 'https://raw.githubusercontent.com/o/r/main/s.sh'],
    ['github non-blob page', 'https://github.com/org/repo/issues/1.md'],
    ['malformed %-escape', 'https://raw.githubusercontent.com/o/r/main/%zz.md'],
    ['truncated %-escape', 'https://raw.githubusercontent.com/o/r/main/skill%E0%A4%A.md'],
  ])('rejects %s', (_n, url) => {
    expect(() => validateSkillUrl(url)).toThrow(ValidationError);
  });

  it('derives the file name from the last path segment', () => {
    expect(filenameFromUrl('https://raw.githubusercontent.com/o/r/main/dir/my%20skill.md')).toBe('my skill.md');
  });
});

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])(
    '%s is private',
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(['185.199.108.133', '8.8.8.8', '2606:50c0:8000::154'])('%s is public', (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe('SafeHttpsFetcher', () => {
  it('returns the bytes of an allowed file and never sends credentials', async () => {
    let seen: RequestInit | undefined;
    const f = new SafeHttpsFetcher({
      resolveHost: PUBLIC,
      fetchImpl: (async (_u: string, init?: RequestInit) => ((seen = init), resp('# hi'))) as unknown as typeof fetch,
    });
    const r = await f.fetch(OK_URL);
    expect(new TextDecoder().decode(r.bytes)).toBe('# hi');
    expect(r.finalUrl).toBe(OK_URL);
    expect(seen?.redirect).toBe('manual');
    expect(seen?.credentials).toBe('omit');
    expect(JSON.stringify(seen?.headers)).not.toMatch(/authorization|cookie/i);
  });

  it('follows a redirect inside the allowlist and re-validates each hop', async () => {
    const hits: string[] = [];
    const f = fetcher((u) => {
      hits.push(u);
      return u.includes('/old/') ? resp(null, { status: 302, headers: { location: 'https://raw.githubusercontent.com/org/repo/main/new.md' } }) : resp('ok');
    });
    expect((await f.fetch('https://raw.githubusercontent.com/old/x/main/s.md')).finalUrl).toContain('/new.md');
    expect(hits).toHaveLength(2);
  });

  it('rejects a redirect to another host, to http, and a redirect loop', async () => {
    const evil = fetcher(() => resp(null, { status: 302, headers: { location: 'https://evil.example/s.md' } }));
    await expect(evil.fetch(OK_URL)).rejects.toThrow(/not allowed/);
    const http = fetcher(() => resp(null, { status: 301, headers: { location: 'http://raw.githubusercontent.com/o/r/m/s.md' } }));
    await expect(http.fetch(OK_URL)).rejects.toThrow(/https/);
    const loop = fetcher(() => resp(null, { status: 302, headers: { location: OK_URL } }));
    await expect(loop.fetch(OK_URL)).rejects.toThrow(/too many redirects/);
  });

  it('rejects oversize bodies (streamed cap, header cap), HTML, bad zips and non-200', async () => {
    const big = fetcher(() => resp('x'.repeat(100)), { maxBytes: 50 });
    await expect(big.fetch(OK_URL)).rejects.toThrow(/too large/);
    const declared = fetcher(() => resp('x', { headers: { 'content-length': '999999999' } }));
    await expect(declared.fetch(OK_URL)).rejects.toThrow(/too large/);
    const html = fetcher(() => resp('<html>', { type: 'text/html; charset=utf-8' }));
    await expect(html.fetch(OK_URL)).rejects.toThrow(/content type/);
    const fakeZip = fetcher(() => resp('not a zip', { type: 'application/zip' }));
    await expect(fakeZip.fetch('https://raw.githubusercontent.com/o/r/main/s.zip')).rejects.toThrow(/zip/);
    const nf = fetcher(() => resp('nope', { status: 404 }));
    await expect(nf.fetch(OK_URL)).rejects.toThrow(/HTTP 404/);
  });

  it('accepts a real zip and refuses hosts that resolve to private addresses', async () => {
    const zip = zipSync({ 'SKILL.md': strToU8('# x') });
    const ok = fetcher(() => resp(zip, { type: 'application/zip' }));
    expect((await ok.fetch('https://raw.githubusercontent.com/o/r/main/s.zip')).bytes[0]).toBe(0x50);
    const priv = fetcher(() => resp('x'), { resolveHost: async () => ['10.0.0.5'] });
    await expect(priv.fetch(OK_URL)).rejects.toThrow(/non-public/);
    const dnsFail = fetcher(() => resp('x'), { resolveHost: async () => { throw new Error('ENOTFOUND'); } });
    await expect(dnsFail.fetch(OK_URL)).rejects.toThrow(/cannot resolve/);
  });
});

describe('MockUrlFetcher', () => {
  it('applies the real allowlist and serves canned files', async () => {
    const m = new MockUrlFetcher({ [OK_URL]: '# skill' });
    expect(new TextDecoder().decode((await m.fetch(OK_URL)).bytes)).toBe('# skill');
    await expect(m.fetch('https://evil.example/s.md')).rejects.toThrow(ValidationError);
    await expect(m.fetch('https://raw.githubusercontent.com/o/r/main/missing.md')).rejects.toThrow(/404/);
  });
});
