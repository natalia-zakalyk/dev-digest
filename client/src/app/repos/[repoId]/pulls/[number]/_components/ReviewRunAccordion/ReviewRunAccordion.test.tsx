import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";

const deleteReview = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: deleteReview, isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(() => {
  cleanup();
  deleteReview.mockClear();
});

const finding = (id: string, severity: FindingRecord["severity"]) =>
  ({
    id,
    severity,
    category: "security",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
  }) as FindingRecord;

const REVIEW = {
  id: "rev-1",
  run_id: "run-1",
  agent_name: "Security",
  verdict: "request_changes",
  summary: "Needs work",
  score: 40,
  created_at: "2026-06-11T18:44:34.000Z",
  findings: [finding("1", "CRITICAL"), finding("2", "WARNING")],
} as unknown as ReviewRecord;

function renderAccordion(props: Partial<React.ComponentProps<typeof ReviewRunAccordion>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <ReviewRunAccordion review={REVIEW} prId="pr1" {...props} />
    </NextIntlClientProvider>,
  );
}


describe("ReviewRunAccordion", () => {
  it("header shows verdict and pluralized counts", () => {
    renderAccordion();
    const toggle = screen.getByRole("button", { name: /^Security/, expanded: false });
    expect(toggle).toHaveTextContent("request changes");
    expect(toggle).toHaveTextContent("2 findings · 1 blocker");
  });

  it("the header button toggles the body (aria-expanded)", () => {
    renderAccordion();
    const toggle = screen.getByRole("button", { name: /^Security/, expanded: false });
    expect(screen.queryByText("Finding 1")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Finding 1")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("delete is a sibling button: it asks for confirmation and doesn't toggle", () => {
    renderAccordion();
    fireEvent.click(screen.getByRole("button", { name: "Delete this review run" }));
    expect(screen.getByRole("button", { name: /^Security/, expanded: false })).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete this “Security” review run?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(deleteReview).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete this review run" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteReview).toHaveBeenCalledWith("rev-1");
  });

  it("opens when the timeline targets its run", () => {
    renderAccordion({ targetRunId: "run-1", targetNonce: 1 });
    expect(screen.getByRole("button", { name: /^Security/, expanded: true })).toBeInTheDocument();
  });
});
