import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's left list. */
export const s = {
  aside: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  },
  head: { padding: "16px 16px 12px" },
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: 700, flex: 1 },
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px" },
} satisfies Record<string, CSSProperties>;
