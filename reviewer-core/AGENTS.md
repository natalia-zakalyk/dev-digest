# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. TypeScript 5.7 + Zod 3.24 + openai SDK 4. Package manager: **npm**.

## Read When
- [docs/pipeline.md](docs/pipeline.md) — before changing orchestration (single-pass / map-reduce), prompt assembly, LLM calls, structured output, grounding, scoring or usage/cost reporting.
- `onion-architecture` skill ([../.claude/skills/onion-architecture/SKILL.md](../.claude/skills/onion-architecture/SKILL.md)) — this package is the review domain core; `src/llm/` is its only adapter ring. Purity is checked from the server: `cd ../server && pnpm lint:arch`.
- [specs/review-engine.md](specs/review-engine.md) — before changing the public API (`src/index.ts`) or any invariant; check its test-coverage table when adding tests. **Find/extend a spec in `specs/` before implementing a feature.**
- [README.md](README.md) — first orientation: pipeline diagram and what the package is for.
- [../TESTING.md](../TESTING.md) — before writing or restructuring tests (hermetic, stubbed `LLMProvider`).
- Server-side caller: `../server/src/modules/reviews/run-executor.ts` — before changing anything it passes or reads.

## Commands
- `npm test` · `npm run typecheck` (`build` is also only a type-check — the package never emits JS)

## Where things live
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate vs the diff
- `src/llm/` — provider + structured output · `src/review/run.ts` — orchestration
- `src/index.ts` — public API; anything not exported here is internal

## Conventions
- **No side effects** except the call through the injected `LLMProvider`: no DB, GitHub, FS, env reads.
- Contracts come from `@devdigest/shared` (path alias → `../server/src/vendor/shared`); don't define them here.
- Tests use a stubbed `LLMProvider` — no keys, no network.

## Gotchas
- Server consumes this package's **source** via tsconfig alias — a breaking export change breaks server typecheck.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are empty in the starter; lessons fill them.

## Do not touch
- Grounding must stay mandatory and the score recomputed from surviving findings.
- Injection defense stays a trusted rule (`INJECTION_GUARD`), not keyword filtering.

## Insights
@INSIGHTS.md
