import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const mk = (id: string, status: ConventionCandidate["status"], rule: string): ConventionCandidate => ({
  id,
  rule,
  category: "async",
  evidence_path: "src/a.ts",
  evidence_snippet: "x",
  evidence_line_start: 1,
  evidence_line_end: 1,
  confidence: 0.9,
  accepted: status === "accepted",
  status,
});

let candidates: ConventionCandidate[] = [];
let loaded: { last_scan_at: string | null } = { last_scan_at: "2026-10-11T10:00:00Z" };
const extractMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "payments-api", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: { candidates, ...loaded, sample_files: null }, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false, isSuccess: false }),
  useUpdateConvention: () => ({ mutate: updateMutate }),
  useConventionSkillDraft: () => ({ mutate: vi.fn(), isError: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({ useCreateSkill: () => ({ mutate: vi.fn(), isPending: false, isError: false }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>nf</div> }));

import { ConventionsView } from "./ConventionsView";

afterEach(cleanup);
beforeEach(() => {
  extractMutate.mockReset();
  updateMutate.mockReset();
  loaded = { last_scan_at: "2026-10-11T10:00:00Z" };
  candidates = [mk("a", "accepted", "Use async/await"), mk("b", "pending", "Use singletons"), mk("c", "rejected", "No default exports")];
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages, common }}>
      <ToastProvider>
        <ConventionsView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("lists candidates with the accepted count and filters by status", () => {
    renderView();
    expect(screen.getAllByTestId("convention-card")).toHaveLength(3);
    expect(screen.getByText("1 of 3 accepted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pending/ }));
    expect(screen.getAllByTestId("convention-card")).toHaveLength(1);
    expect(screen.getByText("Use singletons")).toBeInTheDocument();
  });

  it("Create skill opens the modal only when something is accepted", () => {
    candidates = [mk("b", "pending", "Use singletons")];
    renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("re-scan triggers the extractor", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    expect(extractMutate).toHaveBeenCalled();
  });

  it("shows the empty state with a Run extraction CTA when nothing was scanned", () => {
    candidates = [];
    loaded = { last_scan_at: null };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));
    expect(extractMutate).toHaveBeenCalled();
  });

  it("accepting a card patches its status", () => {
    renderView();
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "b", patch: { status: "accepted" } });
  });
});
