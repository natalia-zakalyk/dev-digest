import { MAX_LINKED_DOCS, MAX_LINKED_ISSUES, MAX_SKIPPED_LINKS } from '../constants.js';

/** A plan/spec the PR points at. */
export type DocLink =
  /** A file of the PR's own repo: read locally at the head SHA (no outbound call). */
  | { kind: 'repo_path'; path: string; ref: string }
  /** A document in another repo / a gist: fetched through the allow-listed fetcher. */
  | { kind: 'url'; url: string; ref: string };

/** A link we recognise but will not fetch. */
export interface SkippedLink {
  ref: string;
  note: string;
}

export interface ExtractedLinks {
  docs: DocLink[];
  issues: number[];
  skipped: SkippedLink[];
}

export interface RepoIdent {
  owner: string;
  name: string;
}

const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;
const DOC_EXT_RE = /\.(md|markdown|txt)$/i;
// Repo-relative doc path: at least one directory segment, `.md` extension, no leading slash.
const REL_PATH_RE = /(?:^|[\s(["'`])((?:[\w.-]+\/)+[\w.-]+\.md)(?=$|[\s)\]"'`,.;:])/gim;
// Keyword-prefixed refs only: a bare "#2" ("step #2") is not a ticket link.
const ISSUE_KEYWORD_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|relates?\s+to|related\s+to|part\s+of|implements?|see)\s*:?\s+(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/gi;

const ALLOWED_HOSTS = new Set(['github.com', 'raw.githubusercontent.com', 'gist.githubusercontent.com']);
const sameRepo = (a: RepoIdent, owner: string, name: string) =>
  a.owner.toLowerCase() === owner.toLowerCase() && a.name.toLowerCase() === name.toLowerCase();

/** `..`/absolute/odd paths are dropped here; the git adapter re-checks. */
const safeRelPath = (p: string): string | undefined => {
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..')) return undefined;
  return parts.join('/');
};

/**
 * Pure link extraction from a PR body. Classifies each link as a same-repo doc, an
 * other-repo/gist doc, an issue reference, or a skipped one (tracker hosts / other-repo issues).
 * Dedupes and caps docs/issues; never fetches anything.
 */
export function extractLinks(body: string | null | undefined, repo: RepoIdent): ExtractedLinks {
  const text = body ?? '';
  const docs: DocLink[] = [];
  const issues: number[] = [];
  const skipped: SkippedLink[] = [];
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));

  for (const raw of text.match(URL_RE) ?? []) {
    let url: URL;
    try {
      url = new URL(raw.replace(/[.,;:]+$/, ''));
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(host)) {
      // Any link we will not request is still recorded (host only, no query/credentials) so the UI can say so.
      const ref = `${host}${url.pathname}`.slice(0, 160);
      if (once(`skip:${ref}`)) skipped.push({ ref, note: url.protocol === 'https:' ? 'host not allowed' : 'only https links are fetched' });
      continue;
    }
    const segs = url.pathname.split('/').filter(Boolean);
    if (host === 'github.com') {
      const [owner, name, kind, ...rest] = segs;
      if (!owner || !name) continue;
      if (kind === 'issues' && rest[0] && /^\d+$/.test(rest[0])) {
        if (sameRepo(repo, owner, name)) {
          const n = Number(rest[0]);
          if (once(`issue:${n}`)) issues.push(n);
        } else if (once(`skip:${owner}/${name}#${rest[0]}`)) {
          skipped.push({ ref: `${owner}/${name}#${rest[0]}`, note: 'issue in another repository not fetched' });
        }
        continue;
      }
      if ((kind === 'blob' || kind === 'raw') && rest.length >= 2 && DOC_EXT_RE.test(url.pathname)) {
        const path = safeRelPath(rest.slice(1).join('/'));
        if (!path) continue;
        if (sameRepo(repo, owner, name)) {
          if (once(`path:${path}`)) docs.push({ kind: 'repo_path', path, ref: path });
        } else if (once(`url:${url.href}`)) {
          docs.push({ kind: 'url', url: url.href, ref: `${owner}/${name}:${rest.slice(1).join('/')}` });
        }
      }
      continue;
    }
    if (host === 'raw.githubusercontent.com') {
      const [owner, name, , ...pathSegs] = segs;
      if (!owner || !name || pathSegs.length === 0 || !DOC_EXT_RE.test(url.pathname)) continue;
      const path = safeRelPath(pathSegs.join('/'));
      if (!path) continue;
      if (sameRepo(repo, owner, name)) {
        if (once(`path:${path}`)) docs.push({ kind: 'repo_path', path, ref: path });
      } else if (once(`url:${url.href}`)) {
        docs.push({ kind: 'url', url: url.href, ref: `${owner}/${name}:${pathSegs.join('/')}` });
      }
      continue;
    }
    // gist.githubusercontent.com
    if (DOC_EXT_RE.test(url.pathname) && once(`url:${url.href}`)) {
      docs.push({ kind: 'url', url: url.href, ref: `gist:${segs.slice(-1)[0] ?? ''}` });
    }
  }

  // Paths and issue refs are searched in the text with URLs removed, so a URL's own path is not matched twice.
  const bare = text.replace(URL_RE, ' ');
  for (const m of bare.matchAll(REL_PATH_RE)) {
    const path = safeRelPath(m[1]!);
    if (path && once(`path:${path}`)) docs.push({ kind: 'repo_path', path, ref: path });
  }
  for (const m of text.matchAll(ISSUE_KEYWORD_RE)) {
    const [, owner, name, num] = m;
    if (owner && name && !sameRepo(repo, owner, name)) {
      if (once(`skip:${owner}/${name}#${num}`)) skipped.push({ ref: `${owner}/${name}#${num}`, note: 'issue in another repository not fetched' });
      continue;
    }
    const n = Number(num);
    if (once(`issue:${n}`)) issues.push(n);
  }

  return { docs: docs.slice(0, MAX_LINKED_DOCS), issues: issues.slice(0, MAX_LINKED_ISSUES), skipped: skipped.slice(0, MAX_SKIPPED_LINKS) };
}
