import { describe, it, expect } from "vitest";
import type { IntentSource } from "@devdigest/shared";
import { skippedLinks } from "./helpers";

const src = (o: Partial<IntentSource>): IntentSource => ({ kind: "linked_doc", ref: "docs/a.md", fetched: false, note: "x", ...o });

describe("skippedLinks", () => {
  it("lists unread linked issues/docs once each and ignores other kinds", () => {
    const out = skippedLinks([
      src({}),
      src({}),
      src({ kind: "linked_issue", ref: "#7" }),
      src({ kind: "linked_doc", ref: "ok.md", fetched: true }),
      src({ kind: "branch", ref: "feat/x" }),
    ]);
    expect(out).toEqual(["docs/a.md", "#7"]);
  });
});
