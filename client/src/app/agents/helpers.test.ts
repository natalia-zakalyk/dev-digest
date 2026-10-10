import { describe, it, expect } from "vitest";
import { agentEditorHref } from "./helpers";

describe("agentEditorHref", () => {
  it("links to the editor on the config tab by default and encodes the id", () => {
    expect(agentEditorHref("a1")).toBe("/agents/a1?tab=config");
    expect(agentEditorHref("a 1", "config")).toBe("/agents/a%201?tab=config");
  });
});
