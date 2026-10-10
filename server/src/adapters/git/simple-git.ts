import { simpleGit, type SimpleGit } from 'simple-git';
import { join, resolve, sep } from 'node:path';
import { mkdir, readFile, realpath, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/** Username paired with a GitHub PAT for HTTP Basic auth (GitHub ignores it). */
const GIT_TOKEN_USERNAME = 'x-access-token';

/** Resolves the GitHub PAT at call time (rotations apply without a restart). */
export type GitTokenResolver = () => Promise<string | undefined | null>;

/**
 * `-c` config that authenticates github.com https requests via an HTTP header
 * instead of credentials embedded in the remote URL — so the token never lands
 * in `.git/config`, process listings of the URL, or git error messages. Scoped
 * to `https://github.com/` so it is never sent to another host.
 */
export function gitAuthConfig(token: string | undefined | null): string[] {
  if (!token) return [];
  const basic = Buffer.from(`${GIT_TOKEN_USERNAME}:${token}`).toString('base64');
  return [`http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

/**
 * Resolve `<cloneDir>/<owner>/<name>` and assert it stays STRICTLY inside
 * cloneDir. Defense in depth against owner/name like `..` (path traversal: a
 * dest equal to cloneDir would make clone() rm -rf every checkout).
 */
export function safeClonePath(cloneDir: string, owner: string, name: string): string {
  const root = resolve(cloneDir);
  const dest = resolve(root, owner, name);
  const ownerDir = resolve(root, owner);
  const inside = (p: string) => p.startsWith(root + sep) && p !== root;
  if (
    !owner ||
    !name ||
    !inside(ownerDir) ||
    !inside(dest) ||
    !dest.startsWith(ownerDir + sep)
  ) {
    throw new Error(`Refusing clone path outside the clone dir for '${owner}/${name}'`);
  }
  return dest;
}

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(
    private cloneDir: string,
    private getToken: GitTokenResolver = async () => undefined,
  ) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return safeClonePath(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  /** simple-git bound to `baseDir` carrying the auth header (for network ops). */
  private async authedGit(baseDir: string): Promise<SimpleGit> {
    const config = gitAuthConfig(await this.getToken().catch(() => undefined));
    return simpleGit({ baseDir, config });
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(resolve(dest, '..'), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → reset origin to the credential-free URL (scrubs a token
      // embedded by older versions from .git/config), then fetch latest.
      const g = await this.authedGit(dest);
      await g.remote(['set-url', 'origin', url]);
      await g.fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await (await this.authedGit(this.cloneDir)).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    const g = await this.authedGit(this.clonePathFor(repo));
    await g.fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = await this.authedGit(this.clonePathFor(repo));
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    const root = this.clonePathFor(repo);
    const full = join(root, path);
    if (!full.startsWith(root + sep)) throw new Error(`Refusing to read outside the clone: '${path}'`);
    // The clone is untrusted content: a committed symlink (e.g. docs/x -> ~/.ssh/id_rsa)
    // passes the lexical check above, so also check where it really points.
    const [realRoot, realFull] = await Promise.all([realpath(root), realpath(full)]);
    if (!realFull.startsWith(realRoot + sep)) throw new Error(`Refusing to read outside the clone: '${path}'`);
    return readFile(realFull, 'utf8');
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
