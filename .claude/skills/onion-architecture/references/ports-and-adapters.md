# Ports, adapters, the container and reviewer-core

Read this when you add an external dependency (API, SDK, CLI, fs), wire a new service, or change what reviewer-core receives.

## Contents
1. Existing ports
2. Adding an external dependency
3. Composition root and narrow `Deps`
4. Cross-module access
5. reviewer-core as the domain core

## 1. Existing ports

Ports live in the inner ring. Implementations live in `src/adapters/*`, with test doubles in `src/adapters/mocks.ts`.

| Port (`vendor/shared/adapters.ts`) | Adapter | Wraps |
|---|---|---|
| `LLMProvider` | `adapters/llm/openai.ts`, `anthropic.ts`; OpenRouter from `reviewer-core/src/llm/openrouter.ts` | `openai`, `@anthropic-ai/sdk` |
| `GitHubClient` | `adapters/github/octokit.ts` | `octokit` |
| `GitClient` | `adapters/git/simple-git.ts` | `simple-git`, the fs |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | `@vscode/ripgrep` |
| `Embedder` | `adapters/embedder/openai.ts` | `openai` |
| `AuthProvider`, `SecretsProvider` | `adapters/auth/local.ts`, `adapters/secrets/local.ts` | DB, `~/.devdigest/secrets.json` |
| server-only (next to the impl) | `adapters/{depgraph,tokenizer,astgrep}` | dependency-cruiser, js-tiktoken, tree-sitter |

## 2. Adding an external dependency

1. **Design the port from the caller's need** (Graça: "ports fit the core, not the tool's API"). `listOpenPullRequests(repo): Promise<PrMeta[]>`, not `octokit.rest.pulls.list(params)`.
2. **The adapter is an anti-corruption layer.** It calls the SDK, `safeParse`s the response with Zod, and maps it to domain or contract types. SDK types (`RestEndpointMethodTypes`, `ChatCompletion`) never leave the adapter. It translates SDK errors into `ExternalServiceError` and stays offline-safe (only GitHub + LLM calls are allowed, see root `AGENTS.md`).
3. **Add a mock** to `adapters/mocks.ts` (an in-memory fake with working behaviour, not just `vi.fn()`).
4. **Wire it in `platform/container.ts`** as a lazy getter, plus an entry in `ContainerOverrides`. Secret-backed clients read keys only via `SecretsProvider` and are cleared in `invalidateSecretCaches()`.
5. Export from the `adapters/index.ts` barrel.

The adapter must not import `modules/*` (lint rule `adapters-not-to-modules`). If it needs a constant that lives in a module, move the constant into the adapter or into `vendor/shared`. Today `adapters/{astgrep,depgraph}` import `repo-intel/constants.ts`, which is in the baseline.

## 3. Composition root and narrow `Deps`

`app.ts` (`buildApp`) + `platform/container.ts` are the composition root (Seemann): the one place that does `new` on concrete classes. Today services take the whole `Container` and resolve what they need. That's a service locator: it hides dependencies and forces tests to fake a whole container (`as unknown as Container`).

For **new** services, declare what you use:

```ts
// modules/foo/service.ts — ring 2
export interface FooDeps {
  foos: FooStore;                 // port from ./ports.ts
  github: () => Promise<GitHubClient>;
  jobs: Pick<JobRunner, 'enqueue'>;
}
export class FooService {
  constructor(private deps: FooDeps) {}
}

// modules/foo/routes.ts — wiring next to the plugin (or a factory in container.ts)
const c = app.container;
const service = new FooService({ foos: new FooRepository(c.db), github: () => c.github(), jobs: c.jobs });
```

- No DI library. `@fastify/awilix` exists, but the hand-written container is enough here (Palermo part 4: onion works "with or without an IoC container").
- `platform/container.ts` currently imports module classes (`AgentsRepository`, `ReviewRepository`, `RepoIntelService`). That's allowed for a composition root, but it creates cycles (`no-circular` baseline: repo-intel/service ↔ container). New services should not take `Container`, which breaks the cycle.

## 4. Cross-module access

- Through a container port: `agentsRepo`, `reviewRepo`, `repoIntel` (the `RepoIntel` interface in `repo-intel/types.ts` is the model to copy).
- Or through another module's `constants.ts` / `types.ts` / `index.ts`.
- Never `../other/service.js`, `../other/repository.js` or `../other/helpers.js` (lint rule `no-cross-module-internals`).

## 5. reviewer-core is the domain core

- Its input is `ReviewInput` (diff, context, `llm: LLMProvider`, callbacks such as `onUsage`). It has **no** DB, GitHub, fs, env or clock reads. The server fetches the context (repo map, callers, specs) and passes it in.
- Contracts come from `@devdigest/shared` (path alias into `server/src/vendor/shared`). Don't define contracts in reviewer-core.
- `src/llm/` is reviewer-core's adapter ring (OpenRouter provider, structured output via `openai/helpers/zod`). Everything else is pure (lint rules `reviewer-core-stays-pure`, `reviewer-core-no-io-builtins`). Moving `openrouter.ts` to `server/src/adapters/llm/` is the onion-correct end state. Do it only when that task is asked for, because it changes reviewer-core's public API.
- Invariants that the ring protects: grounding is mandatory, the score is recomputed from surviving findings, and `INJECTION_GUARD` is a trusted rule (see `reviewer-core/AGENTS.md`).
