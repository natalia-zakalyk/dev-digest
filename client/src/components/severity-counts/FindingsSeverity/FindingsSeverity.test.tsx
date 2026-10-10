import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, SeverityCounts } from "@devdigest/shared";
import common from "../../../../messages/en/common.json";
import { FindingsSeverity, CLOSE_DELAY_MS } from "./FindingsSeverity";

afterEach(cleanup);

const finding = (id: string, severity: string, title: string): FindingRecord =>
  ({
    id,
    severity,
    title,
    category: "security",
    file: "src/config.ts",
    start_line: 12,
    end_line: 14,
    confidence: 0.98,
    rationale: "Line 12 contains a literal Stripe secret key.",
  }) as FindingRecord;

const findings = [
  finding("1", "CRITICAL", "Hardcoded Stripe secret key"),
  finding("2", "WARNING", "N+1 query in user list"),
  finding("3", "WARNING", "Missing index"),
];

function renderIt(counts: SeverityCounts | null, fs: FindingRecord[] | undefined = findings) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <FindingsSeverity counts={counts} findings={fs} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsSeverity", () => {
  it("hides zero severities and shows — when there are no findings", () => {
    renderIt({ critical: 1, warning: 0, suggestion: 0 });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    cleanup();
    renderIt({ critical: 0, warning: 0, suggestion: 0 });
    expect(screen.getByText("—")).toBeInTheDocument();
    cleanup();
    renderIt(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hovering a level shows only that severity's findings", () => {
    renderIt({ critical: 1, warning: 2, suggestion: 0 });
    fireEvent.mouseEnter(screen.getByRole("button", { name: "2 warnings" }));
    const tooltip = screen.getByRole("tooltip", { name: "Findings" });
    expect(tooltip).toHaveTextContent("2 findings in this run");
    expect(tooltip).toHaveTextContent("N+1 query in user list");
    expect(tooltip).toHaveTextContent("Missing index");
    expect(tooltip).not.toHaveTextContent("Hardcoded Stripe secret key");
    expect(tooltip).toHaveTextContent("src/config.ts:12-14");
  });

  it("switches severity on hover and closes shortly after the pointer leaves", () => {
    vi.useFakeTimers();
    renderIt({ critical: 1, warning: 2, suggestion: 0 });
    const warning = screen.getByRole("button", { name: "2 warnings" });
    const critical = screen.getByRole("button", { name: "1 critical finding" });
    fireEvent.mouseEnter(warning);
    fireEvent.mouseLeave(warning);
    fireEvent.mouseEnter(critical);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Hardcoded Stripe secret key");

    fireEvent.mouseLeave(critical);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("stays open while the pointer is over the tooltip, even when the counter loses focus", () => {
    vi.useFakeTimers();
    renderIt({ critical: 1, warning: 0, suggestion: 0 });
    const critical = screen.getByRole("button", { name: "1 critical finding" });
    fireEvent.focus(critical);
    fireEvent.mouseLeave(critical);
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    fireEvent.blur(critical);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS * 2));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("tooltip"));
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("opens on keyboard focus or tap, and closes on Esc or an outside click", () => {
    renderIt({ critical: 1, warning: 0, suggestion: 0 });
    const critical = screen.getByRole("button", { name: "1 critical finding" });
    fireEvent.focus(critical);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(critical);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not let the click reach a clickable parent row", () => {
    const onRow = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <div onClick={onRow}>
          <FindingsSeverity counts={{ critical: 1, warning: 0, suggestion: 0 }} findings={findings} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "1 critical finding" }));
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key"));
    expect(onRow).not.toHaveBeenCalled();
  });
});
