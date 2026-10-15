import type { CSSProperties } from "react";

/** Co-located styles for SkillsListView (master-detail, like the Agents editor). */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  left: {
    width: 340,
    flexShrink: 0,
    overflowY: "auto",
    borderRight: "1px solid var(--border)",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 600, padding: "0 2px" } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  right: { flex: 1, minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  noMatch: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  select: { padding: 40, fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
