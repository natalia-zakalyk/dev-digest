import { describe, it, expect } from "vitest";
import { withStableKeys } from "./helpers";

describe("withStableKeys", () => {
  it("keys by content and suffixes repeats", () => {
    expect(withStableKeys(["a", "b", "a", "a"], (x) => x).map((k) => k.key)).toEqual(["a", "b", "a#1", "a#2"]);
  });
  it("keeps the items in order", () => {
    const items = [{ id: 2 }, { id: 1 }];
    expect(withStableKeys(items, (x) => String(x.id)).map((k) => k.item)).toEqual(items);
  });
});
