import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

const f = (id: string, severity: string, title: string, confidence = 0.9): FindingRecord => ({
  ...FINDINGS[0]!,
  id,
  severity: severity as FindingRecord["severity"],
  title,
  confidence,
});

const RUN = [
  f("c1", "CRITICAL", "Hardcoded secret"),
  f("c2", "CRITICAL", "SQL injection"),
  f("w1", "WARNING", "N+1 query"),
];

describe("FindingsPanel — severity pills and filter", () => {
  it("shows one pill per present severity, counted from this run's findings", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    const pills = screen.getByLabelText("Findings by severity");
    expect(pills).toHaveTextContent("2 CRITICAL");
    expect(pills).toHaveTextContent("1 WARNING");
    expect(pills).not.toHaveTextContent("SUGGESTION");
  });

  it("each pill equals the number of cards of that severity below", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
  });

  it("a filter keeps only its level; clicking it again restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    const filters = screen.getByRole("group", { name: "Filter findings by severity" });
    fireEvent.click(within(filters).getByRole("button", { name: "Warning" }));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.click(within(filters).getByRole("button", { name: "Warning" }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("a level with no findings shows the empty state", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Suggestion" }));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — keyboard shortcuts", () => {
  const press = (key: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
    fireEvent.keyDown(target, { key, ...init });

  it("`a` accepts the focused finding; `j` then `d` dismisses the next one", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    press("a");
    expect(mutate).toHaveBeenLastCalledWith({ findingId: "c1", action: "accept", prId: "pr1" });
    press("j");
    press("d");
    expect(mutate).toHaveBeenLastCalledWith({ findingId: "c2", action: "dismiss", prId: "pr1" });
  });

  it("ignores modifier combos (Cmd/Ctrl/Alt)", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    press("a", { metaKey: true });
    press("a", { ctrlKey: true });
    press("d", { altKey: true });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("ignores events another handler already handled", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    const ev = new KeyboardEvent("keydown", { key: "a", cancelable: true });
    ev.preventDefault();
    window.dispatchEvent(ev);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("ignores typing in a text field", () => {
    renderWithIntl(
      <>
        <input aria-label="search" />
        <FindingsPanel findings={RUN} prId="pr1" />
      </>,
    );
    press("a", {}, screen.getByRole("textbox", { name: "search" }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not act on the second key of the global `g` chord", () => {
    renderWithIntl(<FindingsPanel findings={RUN} prId="pr1" />);
    press("g");
    press("a"); // `g a` = go to Agents, not accept
    expect(mutate).not.toHaveBeenCalled();
    press("a");
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
