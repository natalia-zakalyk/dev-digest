import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";

const m = vi.hoisted(() => ({ cancel: vi.fn(), deleteRun: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
  useCancelRun: () => ({ mutate: m.cancel, isPending: false }),
  useDeleteRun: () => ({ mutate: m.deleteRun, isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvents: () => ({ events: [], running: true }),
}));

import { FindingsTab, type FindingsTabProps } from "./FindingsTab";

afterEach(() => {
  cleanup();
  m.cancel.mockClear();
  m.deleteRun.mockClear();
});

const RUN = {
  run_id: "run-1",
  agent_id: "a1",
  agent_name: "Security Reviewer",
  provider: "openrouter",
  model: "m",
  status: "done",
  error: null,
  duration_ms: 1,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: null,
  findings_count: 0,
  grounding: "0/0 passed",
  ran_at: "2026-06-11T18:44:34.000Z",
  score: null,
  blockers: null,
} as RunSummary;

function renderTab(props: Partial<FindingsTabProps> = {}) {
  const onOpenTrace = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        lethalTrifecta={[]}
        runs={[]}
        prRuns={[]}
        prCommits={[]}
        onOpenTrace={onOpenTrace}
        onRunDone={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onOpenTrace };
}

describe("FindingsTab", () => {
  it("shows the empty state when there are no runs and nothing is live", () => {
    renderTab();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
    expect(screen.queryByText("Live review")).not.toBeInTheDocument();
  });

  it("while runs are live: cancels every live run and opens the first trace", () => {
    const { onOpenTrace } = renderTab({ liveRunIds: ["r1", "r2"] });
    expect(screen.getByText("Live review")).toBeInTheDocument();
    expect(screen.getByText("Review in progress…")).toBeInTheDocument();
    expect(screen.queryByText("No findings yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(m.cancel.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"]);

    fireEvent.click(screen.getByRole("button", { name: "Open run trace" }));
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
  });

  it("deletes a timeline run only after confirming in the dialog", () => {
    renderTab({ prRuns: [RUN] });
    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete this run from history?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(m.deleteRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete run" }));
    expect(m.deleteRun).toHaveBeenCalledWith("run-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the lethal trifecta banner with a pluralized count", () => {
    renderTab({ lethalTrifecta: [{ id: "x" } as FindingsTabProps["lethalTrifecta"][number]] });
    expect(screen.getByText("Lethal Trifecta detected")).toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
  });
});
