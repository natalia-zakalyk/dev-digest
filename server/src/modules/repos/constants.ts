/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`.
 *
 * Anchored at the START (scheme + host) so `https://evil.example/x/github.com/o/r`
 * or `file:///tmp/github.com/o/r` cannot match; owner/name are restricted to the
 * GitHub charset. `.`/`..` segments are additionally rejected in parseRepoUrl
 * (they would resolve outside `<cloneDir>/<owner>/<repo>` — path traversal).
 */
export const GITHUB_URL_REGEX =
  /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Path segments that must never be used as an owner/repo name. */
export const FORBIDDEN_REPO_SEGMENTS: ReadonlySet<string> = new Set(['.', '..']);

/** Canonical https clone URL for a GitHub repo — the ONLY URL we clone from. */
export const canonicalCloneUrl = (owner: string, name: string): string =>
  `https://github.com/${owner}/${name}.git`;
