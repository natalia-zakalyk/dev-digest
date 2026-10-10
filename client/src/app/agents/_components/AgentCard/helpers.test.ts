import { describe, it, expect } from "vitest";
import { modelColor } from "./helpers";

describe("modelColor", () => {
  it("uses the known model colour, falling back to the secondary text token", () => {
    expect(modelColor("gpt-4.1")).toBe("#3b82f6");
    expect(modelColor("some-new-model")).toBe("var(--text-secondary)");
  });
});
