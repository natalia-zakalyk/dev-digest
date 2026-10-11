import { describe, it, expect } from "vitest";
import { isExternalSource } from "./constants";

describe("isExternalSource", () => {
  it.each(["imported_url", "imported_file", "community"] as const)("%s is external", (source) => {
    expect(isExternalSource(source)).toBe(true);
  });
  it.each(["manual", "extracted"] as const)("%s is not external", (source) => {
    expect(isExternalSource(source)).toBe(false);
  });
});
