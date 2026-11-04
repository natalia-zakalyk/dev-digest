/* Review-finding support for the DiffViewer (Smart Diff). Pure helpers + the
   API shape the viewer needs. The viewer stays generic: the host injects how a
   finding is rendered (`renderFinding`), so this folder never imports route code. */
import type { ReactNode } from "react";
import type { FindingRecord } from "@devdigest/shared";
import { lineKey } from "./comments";
import { SEVERITY_LINE_LABEL, SEVERITY_RANK } from "./constants";

export type LineSeverity = keyof typeof SEVERITY_LINE_LABEL;

/** Context the viewer hands to `renderFinding`. */
export interface RenderFindingCtx {
  /** Close the card; given only for cards that have a line label to reopen them. */
  onClose?: () => void;
}

/** What the viewer needs to show findings inside the diff. */
export interface DiffFindingApi {
  /** Findings per file path. */
  byPath: ReadonlyMap<string, FindingRecord[]>;
  /** Hide finding cards, bars and labels (default: shown). The file-card dot stays. */
  showFindings?: boolean;
  /**
   * Must return a real component element (`<DiffFinding …/>`), never an inline JSX tree.
   * `onClose` is given for cards that have a line label to reopen them; the card shows its X only then.
   */
  renderFinding: (f: FindingRecord, ctx?: RenderFindingCtx) => ReactNode;
}

/** Findings are anchored to the new-file (RIGHT) side at `start_line`. */
export function findingLineKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/** Highest severity among the findings that has a line label (INFO/unknown → null). */
export function topSeverity(list: FindingRecord[]): LineSeverity | null {
  let best: LineSeverity | null = null;
  for (const f of list) {
    const sev = f.severity as string;
    if (!(sev in SEVERITY_RANK)) continue;
    const cur = sev as LineSeverity;
    if (best === null || SEVERITY_RANK[cur] < SEVERITY_RANK[best]) best = cur;
  }
  return best;
}

/** Most severe first; stable for equal severities. */
export function sortBySeverity(list: FindingRecord[]): FindingRecord[] {
  const rank = (f: FindingRecord) => SEVERITY_RANK[f.severity as LineSeverity] ?? 99;
  return [...list].sort((a, b) => rank(a) - rank(b));
}
