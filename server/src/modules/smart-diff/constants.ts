import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of the groups (equals the `SmartDiffRole` enum order). */
export const ROLE_DISPLAY_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/** Classification precedence; `core` is the fallback when nothing matches. */
export const CLASSIFY_ORDER = ['boilerplate', 'tests', 'wiring', 'docs'] as const;

/** A path rule as data (no glob library, no regex built from strings). All values are lowercase. */
export type PathRule =
  | { kind: 'basename'; names: readonly string[] }
  | { kind: 'suffix'; values: readonly string[] }
  /** Any directory segment (not the file name) equals one of the names. */
  | { kind: 'segment'; names: readonly string[] }
  | { kind: 'basenamePrefix'; values: readonly string[] }
  | { kind: 'basenameInfix'; values: readonly string[] }
  /** First path segment equals one of the names. */
  | { kind: 'topDir'; names: readonly string[] };

export const ROLE_RULES: Readonly<Record<Exclude<SmartDiffRole, 'core'>, readonly PathRule[]>> = {
  boilerplate: [
    {
      kind: 'basename',
      names: ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'cargo.lock', 'poetry.lock', 'gemfile.lock', 'composer.lock', 'go.sum'],
    },
    { kind: 'segment', names: ['dist', 'build', '__snapshots__', 'node_modules'] },
    { kind: 'basenameInfix', values: ['.generated.'] },
    { kind: 'suffix', values: ['.min.js', '.min.css', '.snap'] },
  ],
  tests: [
    { kind: 'suffix', values: ['.test.ts', '.test.tsx', '.test.js', '.test.jsx', '.spec.ts', '.spec.tsx', '.spec.js', '.spec.jsx'] },
    { kind: 'segment', names: ['__tests__', 'test', 'tests', 'e2e', 'fixtures'] },
  ],
  wiring: [
    { kind: 'basename', names: ['package.json', 'index.ts', 'index.js', 'index.mjs', 'docker-compose.yml', 'dockerfile'] },
    { kind: 'basenamePrefix', values: ['tsconfig', '.env', 'docker-compose', '.eslintrc'] },
    { kind: 'basenameInfix', values: ['.config.'] },
    { kind: 'topDir', names: ['.github', '.claude'] },
  ],
  docs: [
    { kind: 'suffix', values: ['.md', '.mdx'] },
    { kind: 'segment', names: ['docs'] },
    { kind: 'basenamePrefix', values: ['readme', 'changelog', 'license'] },
  ],
};
