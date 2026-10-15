/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <RunHistory runs={runs} findingsByRun={findingsByRun} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost", () => {
  it("a finished run shows tokens · cost under its time", () => {
    renderRuns([run({ status: "done", tokens_in: 8200, tokens_out: 919, cost_usd: 0.0013, score: 90, blockers: 0 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("a failed run shows its partial cost", () => {
    renderRuns([run({ status: "failed", error: "boom", tokens_in: 3000, tokens_out: 950, cost_usd: 0.0006 })]);
    expect(screen.getByText("3,950 tok · $0.0006")).toBeInTheDocument();
  });

  it("a running run shows no cost (no fake price)", () => {
    renderRuns([run({ status: "running", tokens_in: null, tokens_out: null, cost_usd: null })]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — findings by severity", () => {
  const finding = (id: string, severity: string) =>
    ({ id, severity, title: `Finding ${id}`, category: "bug", file: "src/a.ts", start_line: 1, end_line: 1, confidence: 0.9, rationale: "why" }) as FindingRecord;

  it("a finished run shows severity counters and keeps the blockers", () => {
    const fs = [finding("1", "CRITICAL"), finding("2", "CRITICAL"), finding("3", "WARNING")];
    renderRuns([run({ findings_count: 3, blockers: 2, score: 38 })], new Map([["run-1", fs]]));
    expect(screen.getByRole("img", { name: "2 critical findings" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 warning" })).toBeInTheDocument();
    // No clickable counters on the timeline: clicking does nothing…
    expect(screen.queryByRole("button", { name: /critical|warning/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("img", { name: "2 critical findings" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // …but hovering shows that level's findings.
    fireEvent.mouseEnter(screen.getByRole("img", { name: "1 warning" }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Finding 3");
    expect(tooltip).not.toHaveTextContent("Finding 1");
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.queryByText(/3 findings/)).not.toBeInTheDocument();
  });

  it("falls back to the plain count when the run's review isn't loaded", () => {
    renderRuns([run({ findings_count: 3, blockers: 0, score: 72 })], new Map());
    expect(screen.getByText(/3 findings/)).toBeInTheDocument();
  });

  it("uses singular forms for one finding / one blocker", () => {
    renderRuns([run({ findings_count: 1, blockers: 1, score: 50 })], new Map());
    expect(screen.getByText("1 finding · 1 blocker")).toBeInTheDocument();
  });
});

describe("RunHistory — actions", () => {
  it("delete is a real button that reports the run id; hidden while running", () => {
    const onDelete = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <RunHistory runs={[run({}), run({ run_id: "run-2", status: "running" })]} onOpenTrace={() => {}} onDelete={onDelete} />
      </NextIntlClientProvider>,
    );
    const del = screen.getAllByRole("button", { name: "Delete run" });
    expect(del).toHaveLength(1);
    fireEvent.click(del[0]!);
    expect(onDelete).toHaveBeenCalledWith("run-1");
  });
});
