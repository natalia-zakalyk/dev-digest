import { describe, it, expect } from "vitest";
import type { Repo } from "@/lib/types";
import { activeKeyFor, isTextInput, toShellRepo } from "./helpers";

describe("activeKeyFor", () => {
  it.each([
    ["/settings/api-keys", "settings"],
    ["/repos/r1/pulls", "pulls"],
    ["/repos/r1/pulls/482", "pulls"],
    ["/agents", "agents"],
    ["/agents/a1", "agents"],
    ["/onboarding", "onboarding-tour"],
    ["/", ""],
  ])("%s → %s", (path, key) => {
    expect(activeKeyFor(path)).toBe(key);
  });
});

describe("toShellRepo", () => {
  it("maps a repo and labels its sync state", () => {
    const repo = { id: "r1", full_name: "acme/api", default_branch: "main", last_polled_at: null } as Repo;
    expect(toShellRepo(repo)).toEqual({
      id: "r1",
      full_name: "acme/api",
      default_branch: "main",
      syncedLabel: "not synced",
    });
    expect(toShellRepo({ ...repo, last_polled_at: "2026-01-01T00:00:00Z" } as Repo).syncedLabel).toBe("synced");
  });
});

describe("isTextInput", () => {
  it("detects text-entry targets", () => {
    expect(isTextInput(document.createElement("input"))).toBe(true);
    expect(isTextInput(document.createElement("textarea"))).toBe(true);
    expect(isTextInput(document.createElement("div"))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });
});
