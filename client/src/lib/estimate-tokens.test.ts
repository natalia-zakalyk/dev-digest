import { describe, it, expect } from "vitest";
import { estimateTokens } from "./estimate-tokens";

describe("estimateTokens", () => {
  it("rounds up at ~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("1234")).toBe(1);
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("123456789")).toBe(3);
  });
});
