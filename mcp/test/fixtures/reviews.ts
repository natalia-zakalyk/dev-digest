import type { FindingInput, ReviewInput } from '../../src/shape/index.js';

export function finding(over: Partial<FindingInput> = {}): FindingInput {
  return {
    id: 'f1',
    severity: 'WARNING',
    file: 'src/a.ts',
    startLine: 10,
    title: 'Something is off',
    rationale: 'Because of reasons.',
    suggestion: 'Do it differently.',
    confidence: 0.8,
    dismissedAt: null,
    ...over,
  };
}

export function review(findings: FindingInput[], over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    id: 'rev1',
    agentId: 'agent-1',
    agentName: 'security-reviewer',
    runId: 'run-1',
    kind: 'review',
    verdict: 'request_changes',
    score: 42,
    createdAt: '2026-11-03T10:00:00Z',
    findings,
    ...over,
  };
}

const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];

/** Deterministic big input; every text field is long so the budget guard has to work. */
export function bigFindings(n: number, textLen = 3_000): FindingInput[] {
  return Array.from({ length: n }, (_, i) =>
    finding({
      id: `f${i}`,
      severity: SEVERITIES[i % 3]!,
      file: `src/file-${i % 17}.ts`,
      startLine: (i * 7) % 400,
      title: `Finding number ${i} ` + 'x'.repeat(textLen),
      rationale: 'r'.repeat(textLen),
      suggestion: 's'.repeat(textLen),
    }),
  );
}
