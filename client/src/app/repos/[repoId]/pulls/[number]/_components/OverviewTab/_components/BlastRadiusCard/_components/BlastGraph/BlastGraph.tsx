/* BlastGraph — accessible SVG of the blast radius: changed symbols, their callers, endpoints and crons.
   Layout is the pure `layoutBlastGraph`; this component only draws it. Labels are untrusted repo text,
   rendered as SVG text nodes only. Spec: client/specs/blast-radius.md (O6) */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@/lib/types";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "../../constants";
import { layoutBlastGraph, type GraphColumn, type GraphEdge, type GraphNode } from "../../helpers";
import {
  COLUMN_HEADERS,
  HEADER_FONT_SIZE,
  NODE_COLORS,
  NODE_FONT_SIZE,
  NODE_SUBLABEL_FONT_SIZE,
  NODE_TEXT_X,
} from "./constants";
import { s } from "./styles";

interface BlastGraphProps {
  downstream: BlastRadiusResponse["downstream"];
  /** Card totals: a column header reads "N OF M" when fewer than M nodes are drawn. */
  counts: BlastRadiusResponse["counts"];
}

function columnHeader(t: ReturnType<typeof useTranslations>, col: GraphColumn, counts: BlastRadiusResponse["counts"]): string {
  const { key, countKey } = COLUMN_HEADERS[col.kind];
  const total = counts[countKey];
  return col.count < total
    ? t(`graph.column.${key}Of`, { drawn: col.count, total })
    : t(`graph.column.${key}`, { count: col.count });
}

function edgePath(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + GRAPH_NODE_WIDTH;
  const y1 = from.y + GRAPH_NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + GRAPH_NODE_HEIGHT / 2;
  const dx = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function Edges({
  edges,
  byId,
  activeId,
}: {
  edges: GraphEdge[];
  byId: Map<string, GraphNode>;
  activeId: string | null;
}) {
  return (
    <g aria-hidden="true">
      {edges.map((e) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to) return null;
        const active = activeId !== null && (e.from === activeId || e.to === activeId);
        return <path key={`${e.from}>${e.to}`} d={edgePath(from, to)} style={active ? s.edgeActive : s.edge} />;
      })}
    </g>
  );
}

function Node({
  node,
  onActive,
}: {
  node: GraphNode;
  onActive: (id: string | null) => void;
}) {
  const c = NODE_COLORS[node.kind];
  const cut = node.label !== node.fullLabel || (node.fullSublabel !== undefined && node.sublabel !== node.fullSublabel);
  const title = node.fullSublabel ? `${node.fullLabel} ${node.fullSublabel}` : node.fullLabel;
  const twoLines = node.sublabel !== undefined;
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      onMouseEnter={() => onActive(node.id)}
      onMouseLeave={() => onActive(null)}
    >
      {cut && <title>{title}</title>}
      <rect
        width={GRAPH_NODE_WIDTH}
        height={GRAPH_NODE_HEIGHT}
        rx={5}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={c.strokeWidth}
      />
      <text
        x={NODE_TEXT_X}
        y={twoLines ? GRAPH_NODE_HEIGHT / 2 - 7 : GRAPH_NODE_HEIGHT / 2}
        dominantBaseline="central"
        fill={c.text}
        fontSize={NODE_FONT_SIZE}
        fontWeight={node.kind === "symbol" ? 700 : 500}
        className="mono"
      >
        {node.label}
      </text>
      {node.sublabel !== undefined && (
        <text
          x={NODE_TEXT_X}
          y={GRAPH_NODE_HEIGHT / 2 + 8}
          dominantBaseline="central"
          fill="var(--text-muted)"
          fontSize={NODE_SUBLABEL_FONT_SIZE}
          className="mono"
        >
          {node.sublabel}
        </text>
      )}
    </g>
  );
}

export function BlastGraph({ downstream, counts }: BlastGraphProps) {
  const t = useTranslations("blast");
  const layout = React.useMemo(() => layoutBlastGraph(downstream), [downstream]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  if (layout.drawnSymbols === 0) return <div style={{ ...s.note, marginTop: 12 }}>{t("graph.empty")}</div>;

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const summary = t("graph.summary", {
    symbols: layout.drawnSymbols,
    callers: layout.drawnCallers,
    targets: layout.drawnTargets,
  });

  return (
    <div style={s.root}>
      <div style={s.scroller}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          style={s.svg}
        >
          <desc>{summary}</desc>
          {layout.columns.map((col) => (
            <text
              key={col.kind}
              x={col.x}
              y={HEADER_FONT_SIZE}
              fill={COLUMN_HEADERS[col.kind].color}
              fontSize={HEADER_FONT_SIZE}
              fontWeight={700}
              letterSpacing="0.06em"
            >
              {columnHeader(t, col, counts)}
            </text>
          ))}
          <Edges edges={layout.edges} byId={byId} activeId={activeId} />
          {layout.nodes.map((n) => (
            <Node key={n.id} node={n} onActive={setActiveId} />
          ))}
        </svg>
      </div>
      {layout.usesSymbolLevelTargets && <div style={s.note}>{t("graph.attribution")}</div>}
      {layout.hiddenSymbols > 0 && <div style={s.note}>{t("graph.symbolsNotDrawn", { count: layout.hiddenSymbols })}</div>}
      {layout.hiddenCallers > 0 && <div style={s.note}>{t("graph.callersNotDrawn", { count: layout.hiddenCallers })}</div>}
      {layout.hiddenTargets > 0 && <div style={s.note}>{t("graph.targetsNotDrawn", { count: layout.hiddenTargets })}</div>}
    </div>
  );
}
