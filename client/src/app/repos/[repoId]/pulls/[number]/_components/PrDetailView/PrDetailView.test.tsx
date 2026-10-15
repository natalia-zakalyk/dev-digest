import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrDetail } from "@/lib/types";
import prReview from "../../../../../../../../messages/en/prReview.json";
import runs from "../../../../../../../../messages/en/runs.json";
import common from "../../../../../../../../messages/en/common.json";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/trace", () => ({ useRunTrace: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/lib/hooks/reviews", () => {
  const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return {
    usePrReviews: () => ({ data: [] }),
    usePrActiveRuns: () => ({ data: [] }),
    usePrRuns: () => ({ data: [] }),
    useInvalidatePrRuns: () => ({ activeRuns: vi.fn(), runSettled: vi.fn() }),
    useRunEvents: () => ({ events: [], running: false }),
    useRunReview: () => mutation,
    useCancelRun: () => mutation,
    useDeleteRun: () => mutation,
    useDeleteReview: () => mutation,
    useFindingAction: () => mutation,
    usePrComments: () => ({ data: [] }),
    useCreatePrComment: () => mutation,
  };
});

import { PrDetailView } from "./PrDetailView";

afterEach(() => {
  cleanup();
  nav.replace.mockClear();
  nav.search = "";
});

const PR = {
  number: 482,
  title: "Add rate limiting",
  body: "PR description body",
  author: "dev",
  branch: "feat/rl",
  base: "main",
  additions: 10,
  deletions: 2,
  status: "open",
  files_count: 3,
  files: [],
  commits: [],
  head_sha: "abc",
} as unknown as PrDetail;

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, runs, common }}>
      <PrDetailView repoId="repo1" number="482" prId="pr1" pr={PR} repoFullName="acme/api" />
    </NextIntlClientProvider>,
  );
}

describe("PrDetailView", () => {
  it("defaults to the Overview tab", () => {
    renderView();
    expect(screen.getByText("PR description body")).toBeInTheDocument();
  });

  it("falls back to Overview for an unknown ?tab", () => {
    nav.search = "tab=bogus";
    renderView();
    expect(screen.getByText("PR description body")).toBeInTheDocument();
  });

  it("clicking a tab writes ?tab with router.replace", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Agent runs/ }));
    expect(nav.replace).toHaveBeenCalledWith("/repos/repo1/pulls/482?tab=findings");
  });

  it("renders the Agent runs tab from ?tab=findings", () => {
    nav.search = "tab=findings";
    renderView();
    expect(screen.getByText("Review runs")).toBeInTheDocument();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
    expect(screen.queryByText("PR description body")).not.toBeInTheDocument();
  });

  it("keeps other params when opening a tab and mounts the trace drawer from ?trace", () => {
    nav.search = "tab=findings&trace=run-9";
    renderView();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Overview/ }));
    expect(nav.replace).toHaveBeenCalledWith("/repos/repo1/pulls/482?tab=overview&trace=run-9");
  });
});
