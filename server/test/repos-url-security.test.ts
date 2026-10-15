import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';
import { canonicalCloneUrl } from '../src/modules/repos/constants.js';
import { SimpleGitClient, safeClonePath, gitAuthConfig } from '../src/adapters/git/simple-git.js';
import { redactCredentials } from '../src/platform/redact.js';
import { MockAuthProvider, MockGitClient } from '../src/adapters/mocks.js';

/** BE-F1 / BE-F2 / BE-F4 — repo URL parsing, clone-path containment, token hygiene. */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const MALICIOUS = [
  'https://github.com/../workspace',
  'https://evil.example/x/github.com/o/r',
  'file:///tmp/github.com/o/r',
  'https://github.com/./r',
  'https://github.com/o/..',
  'https://github.com/o/r/../../x',
  'https://x:tok@github.com/o/r',
];

describe('parseRepoUrl (BE-F1)', () => {
  it.each(MALICIOUS)('rejects %s', (url) => {
    expect(() => parseRepoUrl(url)).toThrow(/Could not parse owner\/repo/);
  });

  it.each([
    ['https://github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/owner/repo.git', 'owner', 'repo'],
    ['https://github.com/owner/repo/', 'owner', 'repo'],
    ['git@github.com:owner/repo.git', 'owner', 'repo'],
    ['https://github.com/my-org/my.repo_name', 'my-org', 'my.repo_name'],
  ])('parses %s', (url, owner, name) => {
    expect(parseRepoUrl(url)).toEqual({ owner, name });
  });

  it('canonical clone URL round-trips through the parser (BE-F2)', () => {
    expect(canonicalCloneUrl('acme', 'widgets')).toBe('https://github.com/acme/widgets.git');
    expect(parseRepoUrl(canonicalCloneUrl('acme', 'widgets'))).toEqual({ owner: 'acme', name: 'widgets' });
  });
});

describe('POST /repos rejects traversal / non-GitHub URLs (BE-F1)', () => {
  it.each(MALICIOUS.filter((u) => u !== 'https://x:tok@github.com/o/r'))('%s → 4xx, nothing cloned', async (url) => {
    const git = new MockGitClient();
    const app = await buildApp({ config, overrides: { auth: new MockAuthProvider(), git } });
    const res = await app.inject({ method: 'POST', url: '/repos', payload: { url } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(['invalid_repo_url', 'validation_error']).toContain(res.json().error.code);
    expect(git.cloned).toHaveLength(0);
    await app.close();
  });
});

describe('SimpleGitClient clone-path containment (BE-F1)', () => {
  it('safeClonePath keeps owner/name strictly inside cloneDir', () => {
    expect(safeClonePath('/clones', 'o', 'r')).toBe('/clones/o/r');
    for (const [o, n] of [
      ['..', 'workspace'],
      ['o', '..'],
      ['.', 'r'],
      ['o', '.'],
      ['', 'r'],
      ['o', ''],
      ['../..', 'x'],
      ['o', '../../etc'],
    ]) {
      expect(() => safeClonePath('/clones', o!, n!)).toThrow(/outside the clone dir/);
    }
  });

  it('clone() with owner ".." throws BEFORE touching the filesystem', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dd-clones-'));
    await mkdir(join(root, 'acme', 'widgets'), { recursive: true });
    await writeFile(join(root, 'acme', 'widgets', 'keep.txt'), 'x');
    const git = new SimpleGitClient(join(root, 'workspace'));
    // owner '..' + name 'workspace' used to resolve to cloneDir itself → rm -rf.
    await mkdir(join(root, 'workspace', 'acme'), { recursive: true });
    await expect(
      git.clone({ owner: '..', name: 'workspace' }, 'https://github.com/../workspace'),
    ).rejects.toThrow(/outside the clone dir/);
    expect(await readdir(join(root, 'workspace'))).toEqual(['acme']);
    expect(await readdir(join(root, 'acme', 'widgets'))).toEqual(['keep.txt']);
  });

  it('readFile refuses paths escaping the clone', async () => {
    const git = new SimpleGitClient('/clones');
    await expect(git.readFile({ owner: 'o', name: 'r' }, '../../../etc/passwd')).rejects.toThrow(
      /outside the clone/,
    );
  });

  it('readFile refuses a committed symlink pointing outside the clone, follows one inside', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dd-clones-'));
    const clone = join(root, 'clones', 'o', 'r');
    await mkdir(join(clone, 'docs'), { recursive: true });
    await writeFile(join(root, 'secret.txt'), 'top secret');
    await writeFile(join(clone, 'README.md'), 'hello');
    await symlink(join(root, 'secret.txt'), join(clone, 'docs', 'leak.md'));
    await symlink(join(clone, 'README.md'), join(clone, 'docs', 'readme-link.md'));
    const git = new SimpleGitClient(join(root, 'clones'));
    await expect(git.readFile({ owner: 'o', name: 'r' }, 'docs/leak.md')).rejects.toThrow(/outside the clone/);
    await expect(git.readFile({ owner: 'o', name: 'r' }, 'docs/readme-link.md')).resolves.toBe('hello');
  });
});

describe('token hygiene (BE-F4)', () => {
  it('auth travels as a github-scoped http.extraheader, not in the URL', () => {
    expect(gitAuthConfig(undefined)).toEqual([]);
    const [cfg] = gitAuthConfig('ghp_secret');
    expect(cfg).toMatch(/^http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic /);
    const b64 = cfg!.split('basic ')[1]!;
    expect(Buffer.from(b64, 'base64').toString()).toBe('x-access-token:ghp_secret');
  });

  it('redactCredentials strips URL userinfo, auth headers and GitHub tokens', () => {
    const msg =
      "fatal: unable to access 'https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/o/r.git/': " +
      'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46c2VjcmV0 github_pat_ABCDEFGHIJKLMNOPQRSTUVWX_1234';
    const out = redactCredentials(msg);
    expect(out).toContain('https://***@github.com/o/r.git/');
    expect(out).not.toMatch(/ghp_|github_pat_|eC1hY2Nl|x-access-token:/);
    expect(redactCredentials('plain error')).toBe('plain error');
  });
});
