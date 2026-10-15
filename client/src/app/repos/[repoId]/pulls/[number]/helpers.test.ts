import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";
import { buildPrCrumb, collectFindings, findRun, lethalTrifectaFindings, resolvePrId } from "./helpers";
import { isPrDetailTab } from "./constants";

const pull = (id: string, number: number) => ({ id, number }) as PrMeta;
const finding = (id: string, kind = "finding") => ({ id, kind }) as FindingRecord;
const review = (run_id: string | null, findings: FindingRecord[]) =>
  ({ id: `rev-${run_id}`, run_id, findings }) as ReviewRecord;

describe("resolvePrId", () => {
  const pulls = [pull("u1", 481), pull("u2", 482)];
  it("maps the route number to the PR uuid", () => {
    expect(resolvePrId(pulls, "482")).toBe("u2");
  });
  it("returns null while loading, for unknown or non-numeric numbers", () => {
    expect(resolvePrId(undefined, "482")).toBeNull();
    expect(resolvePrId(pulls, "999")).toBeNull();
    expect(resolvePrId(pulls, "abc")).toBeNull();
  });
});

describe("collectFindings / lethalTrifectaFindings", () => {
  it("flattens findings across runs and picks the lethal-trifecta ones", () => {
    const all = collectFindings([review("r2", [finding("a")]), review("r1", [finding("b", "lethal_trifecta")])]);
    expect(all.map((f) => f.id)).toEqual(["a", "b"]);
    expect(lethalTrifectaFindings(all).map((f) => f.id)).toEqual(["b"]);
  });
  it("is empty when reviews are not loaded", () => {
    expect(collectFindings(undefined)).toEqual([]);
  });
});

describe("findRun", () => {
  const reviews = [review("r1", []), review("r2", [])];
  it("finds the review a run produced", () => {
    expect(findRun(reviews, "r2")?.id).toBe("rev-r2");
  });
  it("returns undefined for a missing run id", () => {
    expect(findRun(reviews, null)).toBeUndefined();
    expect(findRun(reviews, "nope")).toBeUndefined();
  });
});

describe("buildPrCrumb", () => {
  it("links the repo and the PR list, ending in #number", () => {
    expect(buildPrCrumb({ repoId: "rp", number: "482", repoName: "acme/api", pullsLabel: "Pull Requests" })).toEqual([
      { label: "acme/api", mono: true, href: "/repos/rp/pulls" },
      { label: "Pull Requests", href: "/repos/rp/pulls" },
      { label: "#482", mono: true },
    ]);
  });
});

describe("isPrDetailTab", () => {
  it("accepts the known tabs only", () => {
    expect(isPrDetailTab("findings")).toBe(true);
    expect(isPrDetailTab("bogus")).toBe(false);
    expect(isPrDetailTab(null)).toBe(false);
  });
});
