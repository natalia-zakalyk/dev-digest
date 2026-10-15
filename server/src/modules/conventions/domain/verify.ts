import type { ConventionExtraction } from '@devdigest/shared';
import { MAX_EVIDENCE_LINES, MIN_CONFIDENCE } from '../constants.js';

export interface VerifiedCandidate {
  rule: string;
  category: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  /** Read from the file, never taken from the model. */
  evidenceSnippet: string;
  confidence: number;
}

export interface VerifyResult {
  verified: VerifiedCandidate[];
  dropped: number;
}

const normalizeRule = (rule: string) => rule.toLowerCase().replace(/\s+/g, ' ').trim();
const normalizePath = (p: string) => p.replace(/^\.\//, '').replace(/\\/g, '/');

/**
 * Keep only candidates whose evidence is real: the file was among the samples,
 * the line range exists and has code. Also drops low-confidence and duplicate rules.
 * `files` maps sample path → full file content.
 */
export function verifyCandidates(
  candidates: ConventionExtraction['candidates'],
  files: ReadonlyMap<string, string>,
): VerifyResult {
  const verified: VerifiedCandidate[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const c of candidates) {
    const path = normalizePath(c.evidence.path);
    const content = files.get(path);
    const key = normalizeRule(c.rule);
    if (content === undefined || c.confidence < MIN_CONFIDENCE || seen.has(key)) {
      dropped++;
      continue;
    }
    const lines = content.split('\n');
    const start = c.evidence.line_start;
    const end = Math.min(c.evidence.line_end, start + MAX_EVIDENCE_LINES - 1);
    if (end < start || start > lines.length || end > lines.length) {
      dropped++;
      continue;
    }
    const snippet = lines.slice(start - 1, end).join('\n');
    if (!snippet.trim()) {
      dropped++;
      continue;
    }
    seen.add(key);
    verified.push({
      rule: c.rule.trim(),
      category: c.category.trim().toLowerCase(),
      evidencePath: path,
      evidenceLineStart: start,
      evidenceLineEnd: end,
      evidenceSnippet: snippet,
      confidence: c.confidence,
    });
  }
  return { verified, dropped };
}
