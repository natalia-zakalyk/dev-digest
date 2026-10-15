/**
 * Credential scrubbing for strings that get persisted or returned (job errors,
 * logs). Git/HTTP errors can echo the remote URL or headers; make sure a token
 * never survives into `jobs.error` or an API response.
 */

const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const AUTH_HEADER = /(authorization:\s*(?:basic|bearer|token)\s+)[^\s'"]+/gi;
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

export function redactCredentials(text: string): string {
  return text
    .replace(URL_USERINFO, '$1***@')
    .replace(AUTH_HEADER, '$1***')
    .replace(GITHUB_TOKEN, '***');
}
