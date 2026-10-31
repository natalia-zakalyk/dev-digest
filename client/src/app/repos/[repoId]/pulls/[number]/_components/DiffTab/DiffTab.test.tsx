import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";
import type { SmartDiffResponse } from "@/lib/types";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import common from "../../../../../../../../messages/en/common.json";

// Mock at the API boundary only: the real hooks, cache and invalidation run.
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: m.get, post: m.post } }));

import { DiffTab } from "./DiffTab";
import { prReviewsOptions } from "@/lib/hooks/reviews";

const patch = "@@ -1,1 +1,2 @@\n x\n+y";
const FILES: PrFile[] = [
  { path: "README.md", additions: 1, deletions: 0, patch },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch },
  { path: "src/a.ts", additions: 1, deletions: 0, patch },
  { path: "src/a.test.ts", additions: 1, deletions: 0, patch },
  { path: "src/index.ts", additions: 1, deletions: 0, patch },
  { path: "src/b.ts", additions: 1, deletions: 0, patch },
];

const sf = (path: string, ids: string[] = []) => ({
  path,
  additions: 1,
  deletions: 0,
  finding_lines: ids.map(() => 2),
  finding_ids: ids,
});
const SMART: SmartDiffResponse = {
  groups: [
    { role: "core", files: [sf("src/a.ts", ["f1"]), sf("src/b.ts", ["f2"])] },
    { role: "tests", files: [sf("src/a.test.ts")] },
    { role: "wiring", files: [sf("src/index.ts")] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

const rec = (id: string, file: string, title: string): FindingRecord => ({
  id,
  severity: "CRITICAL",
  category: "bug",
  title,
  file,
  start_line: 2,
  end_line: 2,
  rationale: "r",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
});
const REVIEWS = [
  {
    id: "r1",
    pr_id: "pr1",
    kind: "review",
    findings: [rec("f1", "src/a.ts", "Off by one"), rec("f2", "src/b.ts", "Missing check")],
  },
] as unknown as ReviewRecord[];

let qc: QueryClient;
function mount() {
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell, common }}>
        <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment={false} repoFullName="o/r" headSha="sha" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  m.get.mockReset();
  m.post.mockReset();
  m.get.mockImplementation(async (path: string) => {
    if (path === "/pulls/pr1/smart-diff") return SMART;
    if (path === "/pulls/pr1/reviews") return REVIEWS;
    if (path === "/pulls/pr1/comments") return [];
    throw new Error(`unexpected GET ${path}`);
  });
  m.post.mockResolvedValue({ finding: REVIEWS[0]!.findings[0] });
});
afterEach(cleanup);

describe("DiffTab smart diff", () => {
  it("groups files by role, shows file counters and findings, accepts a finding, and toggles to original order", async () => {
    mount();

    // groups in the fixed order with role labels
    const headers = await screen.findAllByRole("button", { name: /files?$/ });
    const labels = headers
      .map((b) => b.textContent ?? "")
      .filter((t) => /^(Core|Tests|Wiring|Docs|Boilerplate)/.test(t))
      .map((t) => t.match(/^(Core|Tests|Wiring|Docs|Boilerplate)/)![1]);
    expect(labels).toEqual(["Core", "Tests", "Wiring", "Docs", "Boilerplate"]);

    // counter = FILES with findings (core has 2 files, 2 findings)
    expect(screen.getByLabelText("2 files with findings")).toHaveTextContent("● 2");

    // docs/boilerplate file cards are collapsed; the lock file path is visible
    const lock = screen.getByRole("button", { name: /pnpm-lock\.yaml/ });
    expect(lock).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /README\.md/ })).toHaveAttribute("aria-expanded", "false");

    // finding card under the line, with the severity label; Accept hits the API
    expect(screen.getByText("Off by one")).toBeInTheDocument();
    expect(screen.getAllByText("blocker").length).toBeGreaterThan(0);
    const card = screen.getByText("Off by one").closest("[data-finding-id]") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/findings/f1/accept", undefined));

    // original order: no groups, GitHub order, findings still inline
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByRole("button", { name: /^Core/ })).not.toBeInTheDocument();
    const paths = screen
      .getAllByRole("button", { expanded: undefined })
      .map((b) => b.textContent ?? "")
      .filter((t) => /\.(md|yaml|ts)/.test(t));
    expect(paths[0]).toContain("README.md");
    expect(screen.getByText("Off by one")).toBeInTheDocument();
  });

  it("dismisses a finding under the line via the dismiss endpoint", async () => {
    mount();
    const card = (await screen.findByText("Off by one")).closest("[data-finding-id]") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/findings/f1/dismiss", undefined));
  });

  it("one toolbar button hides/shows findings and comments together; the dot and counter stay", async () => {
    mount();
    // findings only (no comments) still render the button, with the findings count
    const hide = await screen.findByRole("button", { name: "Hide comments & findings (2)" });
    expect(screen.getByText("Off by one")).toBeInTheDocument();

    fireEvent.click(hide);
    expect(screen.queryByText("Off by one")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing check")).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Has review findings" }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("2 files with findings")).toHaveTextContent("● 2");

    fireEvent.click(screen.getByRole("button", { name: "Show comments & findings (2)" }));
    expect(screen.getByText("Off by one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide comments & findings (2)" })).toBeInTheDocument();
  });

  it("refetches smart-diff when the PR's reviews are invalidated", async () => {
    mount();
    await screen.findByText("Off by one");
    const calls = () => m.get.mock.calls.filter(([p]) => p === "/pulls/pr1/smart-diff").length;
    expect(calls()).toBe(1);
    await qc.invalidateQueries({ queryKey: prReviewsOptions("pr1").queryKey });
    await waitFor(() => expect(calls()).toBe(2));
  });
});
