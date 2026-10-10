/**
 * Onion-architecture import rules for server/ (+ reviewer-core via the path alias).
 * Rings, inner → outer: domain → application → infrastructure / interface; app.ts and
 * platform/container.ts are the composition root and may import anything.
 * Rationale and how to fix a violation: .claude/skills/onion-architecture/references/enforcement.md
 *
 * Run: `pnpm lint:arch`. Known (pre-existing) violations live in
 * .dependency-cruiser-known-violations.json — only NEW violations fail.
 */

// Pure rules of a module: ring 1 (domain).
const DOMAIN = '^src/modules/[^/]+/(domain/.+|helpers|constants)\\.ts$';
// Use cases / orchestration: ring 2 (application).
const APPLICATION = '^src/modules/[^/]+/(service|ports|[^/]*-executor)\\.ts$';
// Driving adapter: ring 4 (interface).
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
// Driven adapters: ring 3 (infrastructure).
const REPOSITORY = '^src/modules/.+/(repository|[^/]+\\.repo)\\.ts$';

const DB = '^src/db/';
const ORM = 'node_modules/(drizzle-orm|postgres)/';
const HTTP_FRAMEWORK = 'node_modules/(fastify|@fastify/[^/]+|fastify-[^/]+)/';
const VENDOR_SDK = 'node_modules/(octokit|@octokit/[^/]+|openai|@anthropic-ai/[^/]+|simple-git|p-queue|@ast-grep/[^/]+|@vscode/ripgrep|js-tiktoken)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'Domain code (modules/*/domain/**, helpers.ts, constants.ts) is plain TypeScript: no DB, ORM, ' +
        'framework, SDK, adapters, platform services or fs. Only platform/errors.ts is allowed. ' +
        'Map Drizzle rows in the repository, not here.',
      severity: 'error',
      from: { path: DOMAIN },
      to: {
        path: [DB, '^src/adapters/', '^src/platform/', REPOSITORY, APPLICATION, ROUTES, ORM, HTTP_FRAMEWORK, VENDOR_SDK],
        pathNot: '^src/platform/errors\\.ts$',
      },
    },
    {
      name: 'domain-no-io-builtins',
      comment: 'Domain code must not touch the filesystem, processes or the network directly.',
      severity: 'error',
      from: { path: DOMAIN },
      to: { dependencyTypes: ['core'], path: '^(node:)?(fs|fs/promises|child_process|net|http|https)$' },
    },
    {
      name: 'application-no-persistence',
      comment:
        'Services / executors orchestrate through ports (repositories, container ports). They must not ' +
        'import Drizzle, db/schema, db/rows or concrete adapters — ask a repository for domain types.',
      severity: 'error',
      from: { path: APPLICATION },
      to: { path: [DB, ORM, '^src/adapters/', HTTP_FRAMEWORK, ROUTES] },
    },
    {
      name: 'orm-only-in-repositories',
      comment:
        'Inside modules, only <module>/repository.ts and *.repo.ts may import Drizzle / db/schema. ' +
        'Any other file (pipeline step, feature helper, settings reader…) asks a repository instead.',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: [REPOSITORY, ROUTES, APPLICATION, DOMAIN] },
      to: { path: [ORM, '^src/db/schema'] },
    },
    {
      name: 'routes-no-persistence',
      comment:
        'routes.ts is the HTTP adapter: parse (zod schema), call a service, return a DTO. ' +
        'No Drizzle, no db/*, no repositories — move the query into <module>/repository.ts behind a service.',
      severity: 'error',
      from: { path: ROUTES },
      to: { path: [DB, ORM, REPOSITORY, '^src/adapters/'] },
    },
    {
      name: 'infrastructure-not-to-interface',
      comment: 'Repositories, adapters and db/ must not know about HTTP (Fastify, routes).',
      severity: 'error',
      from: { path: [REPOSITORY, '^src/adapters/', DB] },
      to: { path: [ROUTES, HTTP_FRAMEWORK] },
    },
    {
      name: 'adapters-not-to-modules',
      comment:
        'An adapter implements a port from @devdigest/shared (or its own folder) and must not reach ' +
        'into feature modules.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'A module may use another module only through its public surface (constants.ts, types.ts, ' +
        'index.ts) or a port on the container (agentsRepo, reviewRepo, repoIntel).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/($1|_shared)/', '^src/modules/[^/]+/(constants|types|index)\\.ts$'],
      },
    },
    {
      name: 'reviewer-core-stays-pure',
      comment:
        'reviewer-core is the review domain core: no IO except the injected LLMProvider. ' +
        'src/llm/ is reviewer-core\'s own adapter ring (OpenRouter provider, structured output via the openai SDK); ' +
        'everything else in reviewer-core is pure.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/llm/' },
      to: {
        path: ['^src/(db|adapters|platform|modules)/', ORM, HTTP_FRAMEWORK, VENDOR_SDK],
      },
    },
    {
      name: 'reviewer-core-no-io-builtins',
      comment: 'reviewer-core reads no files, env or processes.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: { dependencyTypes: ['core'], path: '^(node:)?(fs|fs/promises|child_process|net|http|https)$' },
    },
    {
      name: 'no-circular',
      comment: 'Cycles make the rings meaningless — break them with a port or by moving the shared piece inward.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
