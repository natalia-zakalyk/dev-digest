import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastCallerWithFacts, BlastDegradedReason, BlastRadiusResponse } from "@/lib/types";
import {
  BLAST_DEGRADED_REASONS,
  FALLBACK_DEGRADED_REASON,
  GRAPH_COLUMN_GAP,
  GRAPH_HEADER_HEIGHT,
  GRAPH_LABEL_MAX,
  GRAPH_MAX_CALLERS_PER_SYMBOL,
  GRAPH_MAX_SYMBOLS,
  GRAPH_MAX_TARGETS,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  GRAPH_ROW_GAP,
  RESYNCABLE_REASONS,
} from "./constants";

export type BlastCallerRef = BlastCallerWithFacts;

/** `file:line`, shown as mono text. */
export function callerLabel(caller: Pick<BlastCallerRef, "file" | "line">): string {
  return `${caller.file}:${caller.line}`;
}

/** GitHub blob link at the PR head sha, or null when the repo's full name is unknown. */
export function callerHref(
  repoFullName: string | null,
  headSha: string,
  caller: Pick<BlastCallerRef, "file" | "line">,
): string | null {
  return repoFullName ? githubBlobUrl(repoFullName, headSha, caller.file, caller.line) : null;
}

/** Unique changed-symbol names that have no entry in `downstream`. */
export function symbolsWithoutCallers(data: Pick<BlastRadiusResponse, "changed_symbols" | "downstream">): string[] {
  const withCallers = new Set(data.downstream.map((d) => d.symbol));
  return [...new Set(data.changed_symbols.map((c) => c.name))].filter((n) => !withCallers.has(n));
}

/** Unknown or missing reasons fall back to `no_data`. */
export function resolveReason(reason: string | null | undefined): BlastDegradedReason {
  return BLAST_DEGRADED_REASONS.find((r) => r === reason) ?? FALLBACK_DEGRADED_REASON;
}

export function canResync(reason: BlastDegradedReason): boolean {
  return RESYNCABLE_REASONS.has(reason);
}

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Truncated text drawn in the node. */
  label: string;
  /** Untruncated text, shown as the SVG <title> when it differs from `label`. */
  fullLabel: string;
  /** Second line (callers only: basename:line), truncated. */
  sublabel?: string;
  fullSublabel?: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphColumn {
  kind: GraphNodeKind;
  x: number;
  /** Nodes drawn in this column. */
  count: number;
}

export interface GraphCaps {
  maxSymbols: number;
  maxCallersPerSymbol: number;
  maxTargets: number;
  labelMax: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The four columns left to right, for the headers. */
  columns: GraphColumn[];
  width: number;
  height: number;
  drawnSymbols: number;
  drawnCallers: number;
  drawnTargets: number;
  /** Symbols with callers beyond the cap, callers and endpoints/crons that did not fit. */
  hiddenSymbols: number;
  hiddenCallers: number;
  hiddenTargets: number;
  /** True when some drawn caller has no per-caller facts, so its group links symbol -> endpoint/cron. */
  usesSymbolLevelTargets: boolean;
}

export const DEFAULT_GRAPH_CAPS: GraphCaps = {
  maxSymbols: GRAPH_MAX_SYMBOLS,
  maxCallersPerSymbol: GRAPH_MAX_CALLERS_PER_SYMBOL,
  maxTargets: GRAPH_MAX_TARGETS,
  labelMax: GRAPH_LABEL_MAX,
};

/** Cuts to `max` characters, the last one being an ellipsis. */
export function truncateLabel(text: string, max: number): string {
  if (max < 1 || text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Last path segment: `src/routes/cart.routes.ts` -> `cart.routes.ts`. */
export function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1) || file;
}

type BlastImpact = BlastRadiusResponse["downstream"][number];

/** True when the symbol reaches an endpoint or cron: per-caller facts when present, else the group union. */
function reachesTarget(impact: BlastImpact): boolean {
  const groupHas = impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0;
  return impact.callers.some((c) =>
    c.endpoints_affected === undefined && c.crons_affected === undefined
      ? groupHas
      : (c.endpoints_affected?.length ?? 0) > 0 || (c.crons_affected?.length ?? 0) > 0,
  );
}

/**
 * Order in which symbols (already filtered to those with callers) compete for the symbol cap:
 * the ones reaching an endpoint or cron first, then the rest; each part keeps the input (rank) order.
 */
export function selectGraphSymbols(withCallers: BlastImpact[]): BlastImpact[] {
  const reaching = withCallers.filter(reachesTarget);
  return [...reaching, ...withCallers.filter((d) => !reachesTarget(d))];
}

/**
 * Four columns: changed symbols, callers, endpoints, crons.
 * Edges: symbol -> each of its callers; caller -> each endpoint/cron it reaches (per-caller facts).
 * A caller without per-caller facts (`undefined`, older server) is never given invented
 * caller -> target edges: its group falls back to symbol -> endpoint/cron edges from the group union.
 * Endpoint and cron nodes are deduplicated by text (one node, many incoming edges).
 * Only symbols with callers are drawn, up to `caps.maxSymbols`: symbols that reach an endpoint or
 * cron first, then the rest, each part in `downstream` (tree) order (see `selectGraphSymbols`).
 */
export function layoutBlastGraph(
  downstream: BlastRadiusResponse["downstream"],
  caps: GraphCaps = DEFAULT_GRAPH_CAPS,
): GraphLayout {
  const withCallers = downstream.filter((d) => d.callers.length > 0);
  const shown = selectGraphSymbols(withCallers).slice(0, caps.maxSymbols);
  const step = GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP;
  const top = GRAPH_HEADER_HEIGHT;
  const colStep = GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP;
  const colX = [0, colStep, 2 * colStep, 3 * colStep] as const;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const targets = new Map<string, GraphNode>();
  const allTargets = new Set<string>();
  let row = 0;
  let drawnCallers = 0;
  let totalCallers = 0;
  let usesSymbolLevelTargets = false;

  const node = (id: string, kind: GraphNodeKind, full: string, x: number, y: number): GraphNode => ({
    id,
    kind,
    label: truncateLabel(full, caps.labelMax),
    fullLabel: full,
    x,
    y,
  });
  const link = (from: string, to: string) => {
    const key = `${from}>${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };
  /** Returns the target node, creating it while the cap allows; undefined when it does not fit. */
  const target = (kind: "endpoint" | "cron", text: string): GraphNode | undefined => {
    const key = `${kind}:${text}`;
    allTargets.add(key);
    const known = targets.get(key);
    if (known) return known;
    if (targets.size >= caps.maxTargets) return undefined;
    // x and y are set below, once the column contents are known.
    const created = node(`t${targets.size}`, kind, text, 0, 0);
    targets.set(key, created);
    return created;
  };

  shown.forEach((impact, si) => {
    const callers = impact.callers.slice(0, caps.maxCallersPerSymbol);
    totalCallers += impact.callers.length;
    drawnCallers += callers.length;
    const first = row;
    const symbolId = `s${si}`;
    const groupTargets = [
      ...impact.endpoints_affected.map((e) => ["endpoint", e] as const),
      ...impact.crons_affected.map((c) => ["cron", c] as const),
    ];
    for (const [kind, text] of groupTargets) allTargets.add(`${kind}:${text}`);

    callers.forEach((c, ci) => {
      const id = `c${si}-${ci}`;
      const full = c.name;
      const fullSub = `${baseName(c.file)}:${c.line}`;
      const n = node(id, "caller", full, colX[1], top + (first + ci) * step);
      n.sublabel = truncateLabel(fullSub, caps.labelMax);
      n.fullSublabel = fullSub;
      nodes.push(n);
      link(symbolId, id);
      if (c.endpoints_affected === undefined && c.crons_affected === undefined) {
        usesSymbolLevelTargets = true;
        return;
      }
      for (const e of c.endpoints_affected ?? []) {
        const t = target("endpoint", e);
        if (t) link(id, t.id);
      }
      for (const cr of c.crons_affected ?? []) {
        const t = target("cron", cr);
        if (t) link(id, t.id);
      }
    });
    // The symbol sits in the middle of its caller block.
    nodes.push(node(symbolId, "symbol", `${impact.symbol}()`, colX[0], top + (first + (callers.length - 1) / 2) * step));
    row += callers.length;

    if (callers.some((c) => c.endpoints_affected === undefined && c.crons_affected === undefined)) {
      for (const [kind, text] of groupTargets) {
        const t = target(kind, text);
        if (t) link(symbolId, t.id);
      }
    }
  });

  const counts = { endpoint: 0, cron: 0 };
  for (const t of targets.values()) {
    t.x = t.kind === "endpoint" ? colX[2] : colX[3];
    t.y = top + counts[t.kind as "endpoint" | "cron"] * step;
    counts[t.kind as "endpoint" | "cron"] += 1;
    nodes.push(t);
  }

  const rows = Math.max(row, counts.endpoint, counts.cron, 1);
  return {
    nodes,
    edges,
    columns: [
      { kind: "symbol", x: colX[0], count: shown.length },
      { kind: "caller", x: colX[1], count: drawnCallers },
      { kind: "endpoint", x: colX[2], count: counts.endpoint },
      { kind: "cron", x: colX[3], count: counts.cron },
    ],
    width: colX[3] + GRAPH_NODE_WIDTH,
    height: top + rows * step - GRAPH_ROW_GAP,
    drawnSymbols: shown.length,
    drawnCallers,
    drawnTargets: targets.size,
    hiddenSymbols: withCallers.length - shown.length,
    hiddenCallers: totalCallers - drawnCallers,
    hiddenTargets: allTargets.size - targets.size,
    usesSymbolLevelTargets,
  };
}
