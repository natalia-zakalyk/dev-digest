/**
 * Semantic errors (domain ring). Thrown by use cases and the HTTP adapter, mapped to
 * actionable `isError:true` texts by the interface ring (`toToolError`). They carry
 * data only, never wording: the catalog text lives in one place (tools ring).
 */

export interface NamedRef {
  id: string;
  name: string;
}

export abstract class DevDigestError extends Error {
  abstract readonly kind: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AgentNotFound extends DevDigestError {
  readonly kind = 'agent_not_found';
  constructor(
    readonly agent: string,
    readonly validAgents: readonly NamedRef[],
    /** Size of the full agent list; `> validAgents.length` means the list was cut. */
    readonly totalAgents: number = validAgents.length,
  ) {
    super(`Agent "${agent}" not found`);
  }
}

export class RepoNotImported extends DevDigestError {
  readonly kind = 'repo_not_imported';
  constructor(
    readonly repo: string,
    readonly importedRepos: readonly string[],
  ) {
    super(`Repo "${repo}" is not imported`);
  }
}

export class PrNotImported extends DevDigestError {
  readonly kind = 'pr_not_imported';
  constructor(
    readonly repo: string,
    readonly pr: number,
  ) {
    super(`PR #${pr} is not imported for ${repo}`);
  }
}

export class RunRateLimited extends DevDigestError {
  readonly kind = 'run_rate_limited';
  constructor(readonly retryAfterSeconds: number) {
    super(`Review rate limit reached, retry in ${retryAfterSeconds}s`);
  }
}

export class ApiUnreachable extends DevDigestError {
  readonly kind = 'api_unreachable';
  constructor(readonly base: string, cause?: unknown) {
    super(`DevDigest API is not reachable at ${base}`);
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * A run ended `failed` or `cancelled`. NOT an `isError` result: the interface ring
 * reports it as `{status:"failed", run_id, error}` (spec `run_agent_on_pr`).
 */
export class RunFailed extends DevDigestError {
  readonly kind = 'run_failed';
  constructor(
    readonly runId: string,
    readonly reason: string,
  ) {
    super(`Run ${runId} failed: ${reason}`);
  }
}

/** (proposed in spec) `run_id` matches no run of that PR. */
export class RunNotFound extends DevDigestError {
  readonly kind = 'run_not_found';
  constructor(
    readonly runId: string,
    readonly repo: string,
    readonly pr: number,
  ) {
    super(`Run "${runId}" not found for PR #${pr} of ${repo}`);
  }
}

/** (proposed in spec) any other 4xx/5xx or unparsable body. */
export class ApiError extends DevDigestError {
  readonly kind = 'api_error';
  constructor(
    readonly status: number,
    readonly operation: string,
    readonly detail: string,
  ) {
    super(`DevDigest API returned ${status} for ${operation}: ${detail}`);
  }
}

/**
 * (proposed in spec) startup only: `DEVDIGEST_API_BASE` is non-loopback (`not_loopback`) or not a plain
 * `http(s)://host[:port][/path]` URL (`malformed`: other scheme, credentials, query, hash, unparsable).
 * Not a tool result. The message never echoes the value (it may carry credentials).
 */
export class InvalidBaseUrl extends DevDigestError {
  readonly kind = 'invalid_base_url';
  constructor(
    readonly base: string,
    readonly reason: 'not_loopback' | 'malformed' = 'not_loopback',
  ) {
    super(
      reason === 'malformed'
        ? 'DEVDIGEST_API_BASE must be an http:// or https:// URL without username, password, query or hash.'
        : 'DEVDIGEST_API_BASE must be a loopback address (localhost, 127.0.0.1, ::1). Set DEVDIGEST_ALLOW_REMOTE=1 to override.',
    );
  }
}
