import { describe, it, expect } from "vitest";
import type { Agent } from "@devdigest/shared";
import { filterAgents } from "./helpers";

const agent = (name: string, description: string) => ({ id: name, name, description }) as Agent;

describe("filterAgents", () => {
  const agents = [agent("Security Reviewer", "Flags secrets"), agent("Perf", "Finds N+1 queries")];

  it("returns every agent for a blank search", () => {
    expect(filterAgents(agents, "  ")).toBe(agents);
  });

  it("matches name or description, case-insensitively", () => {
    expect(filterAgents(agents, "SECURITY").map((a) => a.name)).toEqual(["Security Reviewer"]);
    expect(filterAgents(agents, "n+1").map((a) => a.name)).toEqual(["Perf"]);
    expect(filterAgents(agents, "nothing")).toEqual([]);
  });
});
