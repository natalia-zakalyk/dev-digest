import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import runs from "../../../../../../../../../../messages/en/runs.json";
import { FindingsSection } from "./FindingsSection";

afterEach(cleanup);

const F = {
  id: "f1",
  severity: "CRITICAL",
  title: "Route renamed",
  file: "server/src/routes.ts",
  start_line: 32,
  end_line: 32,
  rationale: "Breaks clients.",
  suggestion: null,
} as unknown as FindingRecord;

function renderIt(props: { repoFullName?: string | null; headSha?: string | null }) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <FindingsSection findings={[F]} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsSection", () => {
  it("links the finding location to the file at the PR head", () => {
    renderIt({ repoFullName: "acme/api", headSha: "abc123" });
    expect(screen.getByRole("link", { name: "server/src/routes.ts:32" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/abc123/server/src/routes.ts#L32",
    );
  });

  it("falls back to plain text without a repo", () => {
    renderIt({});
    expect(screen.getByText("server/src/routes.ts:32")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
