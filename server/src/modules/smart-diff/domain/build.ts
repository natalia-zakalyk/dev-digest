import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { ROLE_DISPLAY_ORDER } from '../constants.js';
import { classifyFile } from './classify.js';

export interface DiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface DiffFindingInput {
  id: string;
  file: string;
  startLine: number;
}

/** Group PR files by role (fixed order, empty groups omitted) and attach finding lines/ids. Pure. */
export function buildSmartDiff(files: DiffFileInput[], findings: DiffFindingInput[]): SmartDiff {
  const byFile = new Map<string, DiffFindingInput[]>();
  for (const f of findings) {
    const list = byFile.get(f.file);
    if (list) list.push(f);
    else byFile.set(f.file, [f]);
  }

  const buckets = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const own = (byFile.get(file.path) ?? [])
      .slice()
      .sort((a, b) => a.startLine - b.startLine || a.id.localeCompare(b.id));
    const entry: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...new Set(own.map((f) => f.startLine))],
      finding_ids: own.map((f) => f.id),
    };
    const role = classifyFile(file.path);
    const bucket = buckets.get(role);
    if (bucket) bucket.push(entry);
    else buckets.set(role, [entry]);
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of ROLE_DISPLAY_ORDER) {
    const list = buckets.get(role);
    if (list) groups.push({ role, files: list });
  }
  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
