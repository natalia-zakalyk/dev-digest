import type { FindingRecord, PrFile, ReviewRecord, SmartDiffRole } from "@devdigest/shared";
import type { SmartDiffResponse } from "@/lib/types";

export interface RoleGroupData {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Join the server's groups to the PR files by path (the patch lives only on
 * `PrFile`), keeping the server's group order. Files the response doesn't know
 * yet (refresh race) land in `core`, the server's default role.
 */
export function groupPrFiles(prFiles: PrFile[], smartDiff: SmartDiffResponse): RoleGroupData[] {
  const byPath = new Map(prFiles.map((f) => [f.path, f]));
  const placed = new Set<string>();
  const groups: RoleGroupData[] = [];
  for (const g of smartDiff.groups) {
    const files: PrFile[] = [];
    for (const f of g.files) {
      const pf = byPath.get(f.path);
      if (pf && !placed.has(f.path)) {
        files.push(pf);
        placed.add(f.path);
      }
    }
    if (files.length > 0) groups.push({ role: g.role, files });
  }
  const orphans = prFiles.filter((f) => !placed.has(f.path));
  if (orphans.length === 0) return groups;
  const core = groups.find((g) => g.role === "core");
  if (core) core.files.push(...orphans);
  else groups.unshift({ role: "core", files: orphans });
  return groups;
}

/** Map each file path to its counted findings, joining the server's `finding_ids` to the loaded records. */
export function findingsByPath(
  smartDiff: SmartDiffResponse,
  reviews: ReviewRecord[] | undefined,
): Map<string, FindingRecord[]> {
  const records = new Map<string, FindingRecord>();
  for (const r of reviews ?? []) for (const f of r.findings) records.set(f.id, f);
  const out = new Map<string, FindingRecord[]>();
  for (const g of smartDiff.groups) {
    for (const file of g.files) {
      const list = file.finding_ids.flatMap((id) => records.get(id) ?? []);
      if (list.length > 0) out.set(file.path, list);
    }
  }
  return out;
}

/** Number of FILES (not findings) in the group that carry findings. */
export function filesWithFindings(files: PrFile[], byPath: ReadonlyMap<string, FindingRecord[]>): number {
  return files.filter((f) => (byPath.get(f.path)?.length ?? 0) > 0).length;
}
