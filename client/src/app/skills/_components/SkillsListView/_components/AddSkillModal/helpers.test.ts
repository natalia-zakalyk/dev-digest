import { describe, it, expect } from "vitest";
import { isAllowedSkillFile, isHttpsUrl, readFileAsBase64 } from "./helpers";

describe("isAllowedSkillFile", () => {
  it.each(["skill.md", "SKILL.MD", "pack.zip", "a.b.md"])("%s is allowed", (n) => expect(isAllowedSkillFile(n)).toBe(true));
  it.each(["notes.txt", "skill.markdown", "run.sh", "archive.tar.gz", "md", "image.png", "skill.md.exe"])("%s is rejected", (n) =>
    expect(isAllowedSkillFile(n)).toBe(false),
  );
});

describe("isHttpsUrl", () => {
  it("accepts https links only", () => {
    expect(isHttpsUrl("https://raw.githubusercontent.com/o/r/main/s.md")).toBe(true);
    expect(isHttpsUrl("  https://x.example/a  ")).toBe(true);
    expect(isHttpsUrl("http://raw.githubusercontent.com/o/r/main/s.md")).toBe(false);
    expect(isHttpsUrl("raw.githubusercontent.com/o/r/main/s.md")).toBe(false);
    expect(isHttpsUrl("https://")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
  });
});

describe("readFileAsBase64", () => {
  it("returns the base64 without the data: prefix", async () => {
    expect(await readFileAsBase64(new File(["hello"], "a.md"))).toBe(btoa("hello"));
  });
});
