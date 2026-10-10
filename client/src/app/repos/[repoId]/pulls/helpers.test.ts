import { describe, it, expect, afterEach, vi } from "vitest";
import type { PrMeta } from "@/lib/types";
import { countNeedsReview, countOpen, filterPulls, relativeTime, sizeOf } from "./helpers";

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 1,
    title: "Title",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "abc",
    additions: 0,
    deletions: 0,
    files_count: 1,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: null,
    cost_usd: null,
    ...o,
  };
}

describe("sizeOf", () => {
  it.each([
    [99, "S"],
    [100, "M"],
    [399, "M"],
    [400, "L"],
  ])("%i changed lines → %s", (lines, size) => {
    expect(sizeOf(pr({ additions: lines - 10, deletions: 10 }))).toEqual({ size, lines });
  });
});

describe("relativeTime", () => {
  afterEach(() => vi.useRealTimers());

  it("returns — for missing or invalid dates", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(undefined)).toBe("—");
    expect(relativeTime("not a date")).toBe("—");
  });

  it("formats minutes, hours and days relative to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
    expect(relativeTime("2026-01-10T12:00:00Z")).toBe("now");
    expect(relativeTime("2026-01-10T11:45:00Z")).toBe("15m");
    expect(relativeTime("2026-01-10T09:00:00Z")).toBe("3h");
    expect(relativeTime("2026-01-08T12:00:00Z")).toBe("2d");
    // Future timestamps clamp to "now".
    expect(relativeTime("2026-01-10T13:00:00Z")).toBe("now");
  });
});

describe("filterPulls", () => {
  const pulls = [
    pr({ number: 10, title: "Add rate limiting", status: "needs_review", updated_at: "2026-01-02T00:00:00Z" }),
    pr({ number: 11, title: "Fix login", status: "reviewed", updated_at: "2026-01-03T00:00:00Z" }),
    pr({ number: 12, title: "Bump deps", status: "merged", updated_at: null }),
  ];

  it("keeps every PR for 'all' and sorts newest first (missing dates last)", () => {
    const out = filterPulls(pulls, { status: "all", query: "", sort: "newest" });
    expect(out.map((p) => p.number)).toEqual([11, 10, 12]);
  });

  it("sorts oldest first", () => {
    const out = filterPulls(pulls, { status: "all", query: "", sort: "oldest" });
    expect(out.map((p) => p.number)).toEqual([12, 10, 11]);
  });

  it("filters by status and by a case-insensitive title or number query", () => {
    expect(filterPulls(pulls, { status: "reviewed", query: "", sort: "newest" }).map((p) => p.number)).toEqual([11]);
    expect(filterPulls(pulls, { status: "all", query: "  RATE ", sort: "newest" }).map((p) => p.number)).toEqual([10]);
    expect(filterPulls(pulls, { status: "all", query: "12", sort: "newest" }).map((p) => p.number)).toEqual([12]);
  });

  it("does not mutate the input", () => {
    const copy = [...pulls];
    filterPulls(pulls, { status: "all", query: "", sort: "oldest" });
    expect(pulls).toEqual(copy);
  });
});

describe("countOpen / countNeedsReview", () => {
  it("counts open (derived review status) and needs-review PRs", () => {
    const pulls = [
      pr({ status: "needs_review" }),
      pr({ status: "reviewed" }),
      pr({ status: "stale" }),
      pr({ status: "merged" }),
      pr({ status: "closed" }),
    ];
    expect(countOpen(pulls)).toBe(3);
    expect(countNeedsReview(pulls)).toBe(1);
    expect(countOpen([])).toBe(0);
  });
});
