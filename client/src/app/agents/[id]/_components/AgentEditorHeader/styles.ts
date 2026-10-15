import type { CSSProperties } from "react";

/** Co-located styles for the agent editor header. */
export const s = {
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 },
  icon: { color: "var(--accent)" },
  title: { fontSize: 18, fontWeight: 700 },
  actions: { marginLeft: "auto" },
} satisfies Record<string, CSSProperties>;
