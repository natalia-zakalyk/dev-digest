import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import prReview from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";
import { PRRow } from "./PRRow";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
        <PRRow pr={p} repoId="repo-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — COST cell", () => {
  it("shows the PR's run cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows — when the PR has no known cost", () => {
    // Reviewed PR with a date, so the COST cell is the only "—" in the row.
    renderRow(
      pr({
        score: 61,
        updated_at: new Date().toISOString(),
        cost_usd: null,
        findings: { critical: 1, warning: 0, suggestion: 0 },
      }),
    );
    expect(screen.getAllByText("—")).toHaveLength(1);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});

describe("PRRow — FINDINGS cell", () => {
  it("shows a counter per non-zero severity", () => {
    renderRow(pr({ findings: { critical: 2, warning: 0, suggestion: 3 } }));
    expect(screen.getByRole("button", { name: "2 critical findings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 suggestions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /warning/ })).not.toBeInTheDocument();
  });

  it("hovering a counter loads the findings tooltip; tapping it does not open the PR", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // keep the lazy load pending
    push.mockClear();
    renderRow(pr({ findings: { critical: 2, warning: 0, suggestion: 0 } }));
    const counter = screen.getByRole("button", { name: "2 critical findings" });
    fireEvent.mouseEnter(counter);
    expect(screen.getByRole("tooltip", { name: "Findings" })).toHaveTextContent("Loading findings…");
    fireEvent.click(counter);
    expect(push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
