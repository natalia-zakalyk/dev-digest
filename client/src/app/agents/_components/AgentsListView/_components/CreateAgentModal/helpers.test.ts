import { describe, it, expect } from "vitest";
import { pickModel } from "./helpers";

describe("pickModel", () => {
  const listed = ["claude-opus", "claude-sonnet-4-5", "claude-haiku"];
  it("keeps a valid choice", () => expect(pickModel("claude-haiku", listed, "claude-sonnet-4-5")).toBe("claude-haiku"));
  it("falls back to the preferred model after a provider switch", () =>
    expect(pickModel("gpt-4.1", listed, "claude-sonnet-4-5")).toBe("claude-sonnet-4-5"));
  it("falls back to the first listed model when the preferred one is not offered", () =>
    expect(pickModel("gpt-4.1", listed, "nope")).toBe("claude-opus"));
  it("fills an empty value", () => expect(pickModel("", listed, "claude-haiku")).toBe("claude-haiku"));
  it("keeps whatever is typed when there is no list (no key / loading)", () => {
    expect(pickModel("my-model", [], "x")).toBe("my-model");
    expect(pickModel("", [], "x")).toBe("");
  });
});
