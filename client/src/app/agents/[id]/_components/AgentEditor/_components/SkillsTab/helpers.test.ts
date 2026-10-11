import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { matchesFilter, moveItem, orderedSkills, toggleLinked } from "./helpers";

const skill = (id: string, name: string): Skill => ({
  id,
  name,
  description: "",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
});
const link = (skill_id: string, order: number): AgentSkillLink => ({ agent_id: "a", skill_id, order });

describe("orderedSkills", () => {
  it("puts linked skills first in link order, then the rest by name; drops dangling links", () => {
    const skills = [skill("1", "zeta"), skill("2", "alpha"), skill("3", "mid"), skill("4", "beta")];
    const { linked, unlinked } = orderedSkills(skills, [link("3", 1), link("1", 0), link("gone", 2)]);
    expect(linked.map((s) => s.name)).toEqual(["zeta", "mid"]);
    expect(unlinked.map((s) => s.name)).toEqual(["alpha", "beta"]);
  });
});

describe("moveItem", () => {
  it("moves up and down and clamps the target", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("toggleLinked", () => {
  it("appends a new id and removes an existing one", () => {
    expect(toggleLinked(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleLinked(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("matchesFilter", () => {
  it("matches name and type, ignores case", () => {
    expect(matchesFilter(skill("1", "Over-Mocking"), "mock")).toBe(true);
    expect(matchesFilter(skill("1", "x"), "custom")).toBe(true);
    expect(matchesFilter(skill("1", "x"), "nope")).toBe(false);
  });
});
