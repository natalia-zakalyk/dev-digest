import type { CSSProperties } from "react";

/** Co-located styles for the agent editor screen layout. */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" },
  skeleton: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  editor: { flex: 1, minHeight: 0, overflow: "auto" },
} satisfies Record<string, CSSProperties>;
