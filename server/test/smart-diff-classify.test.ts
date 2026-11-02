import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/index.js';

const rows: [string, SmartDiffRole][] = [
  // precedence
  ['__tests__/__snapshots__/x.snap', 'boilerplate'],
  ['.claude/skills/security/SKILL.md', 'wiring'],
  ['e2e/README.md', 'tests'],
  // lock files
  ['pnpm-lock.yaml', 'boilerplate'],
  ['client/pnpm-lock.yaml', 'boilerplate'],
  ['package-lock.json', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  // manifests
  ['package.json', 'wiring'],
  ['server/package.json', 'wiring'],
  // dist/build only as a whole segment
  ['client/dist/app.js', 'boilerplate'],
  ['build/out.js', 'boilerplate'],
  ['src/distance.ts', 'core'],
  ['src/rebuild.ts', 'core'],
  ['src/dist-utils/a.ts', 'core'],
  ['x.generated.ts', 'boilerplate'],
  ['vendor/lib.min.js', 'boilerplate'],
  // tests
  ['a.test.ts', 'tests'],
  ['A.test.tsx', 'tests'],
  ['server/test/x.it.test.ts', 'tests'],
  ['src/a.spec.ts', 'tests'],
  ['src/__tests__/a.ts', 'tests'],
  ['server/test/helpers/pg.ts', 'tests'],
  ['tests/fixtures/data.json', 'tests'],
  ['e2e/flows/01-login.flow.json', 'tests'],
  // barrels
  ['src/index.ts', 'wiring'],
  ['src/index.js', 'wiring'],
  ['src/components/Foo/index.tsx', 'core'],
  // config
  ['vitest.config.ts', 'wiring'],
  ['next.config.mjs', 'wiring'],
  ['tsconfig.json', 'wiring'],
  ['tsconfig.build.json', 'wiring'],
  ['.eslintrc.cjs', 'wiring'],
  ['.env', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.yml', 'wiring'],
  ['docker-compose.dev.yaml', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],
  // docs
  ['docs/plans/x.md', 'docs'],
  ['README.md', 'docs'],
  ['readme.MD', 'docs'],
  ['CHANGELOG.md', 'docs'],
  ['LICENSE', 'docs'],
  ['server/docs/a.md', 'docs'],
  // core
  ['server/src/modules/reviews/service.ts', 'core'],
  ['client/src/app/page.tsx', 'core'],
  // normalization
  ['server\\src\\a.test.ts', 'tests'],
  ['/src/a.ts', 'core'],
  ['./src/a.ts', 'core'],
];

describe('classifyFile', () => {
  it.each(rows)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
