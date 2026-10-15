import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "./helpers";

const skill = (over: Partial<Skill>): Skill => ({
  id: "s",
  name: "n",
  description: "",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...over,
});

describe("filterSkills", () => {
  const list = [
    skill({ id: "a", name: "over-mocking", description: "Flag mocks", type: "convention" }),
    skill({ id: "b", name: "secret-gate", type: "security" }),
  ];

  it("returns everything for a blank query", () => {
    expect(filterSkills(list, "  ")).toHaveLength(2);
  });

  it("matches name, description and type case-insensitively", () => {
    expect(filterSkills(list, "MOCKS").map((s) => s.id)).toEqual(["a"]);
    expect(filterSkills(list, "security").map((s) => s.id)).toEqual(["b"]);
  });
});
