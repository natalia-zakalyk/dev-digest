import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, confidencePct, countByStatus, estimateTokens, filterByStatus, formatEvidence } from "./helpers";

const c = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "1",
  rule: "r",
  evidence_path: "src/a.ts",
  evidence_snippet: "x",
  evidence_line_start: 2,
  evidence_line_end: 4,
  confidence: 0.9,
  accepted: false,
  status: "pending",
  ...over,
});

describe("formatEvidence", () => {
  it("formats ranges, single lines and missing lines", () => {
    expect(formatEvidence(c())).toBe("src/a.ts:2-4");
    expect(formatEvidence(c({ evidence_line_end: 2 }))).toBe("src/a.ts:2");
    expect(formatEvidence(c({ evidence_line_start: null, evidence_line_end: null }))).toBe("src/a.ts");
  });
});

describe("status helpers", () => {
  const list = [c({ id: "a", status: "accepted" }), c({ id: "b" }), c({ id: "d", status: "rejected" })];
  it("filters and counts", () => {
    expect(filterByStatus(list, "all")).toHaveLength(3);
    expect(filterByStatus(list, "accepted").map((x) => x.id)).toEqual(["a"]);
    expect(countByStatus(list, "pending")).toBe(1);
  });
});

describe("confidence + tokens", () => {
  it("maps to percent and colour bands", () => {
    expect(confidencePct(0.914)).toBe(91);
    expect(confidencePct(2)).toBe(100);
    expect(confidenceColor(91)).toBe("var(--ok)");
    expect(confidenceColor(70)).toBe("var(--warn)");
    expect(confidenceColor(40)).toBe("var(--crit)");
  });
  it("estimates tokens", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });
});
