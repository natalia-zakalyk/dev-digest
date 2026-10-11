import { describe, it, expect } from "vitest";
import { readFileAsBase64 } from "./helpers";

describe("readFileAsBase64", () => {
  it("returns the file bytes as bare base64", async () => {
    const file = new File(["# Skill"], "skill.md", { type: "text/markdown" });
    expect(await readFileAsBase64(file)).toBe(btoa("# Skill"));
  });
});
