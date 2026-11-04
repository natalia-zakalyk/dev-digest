import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions (Dismiss persists as dismiss)", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Smart Diff look", () => {
  it("shows the uppercase-able severity word, confidence and a bordered suggested fix", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    // critical reads as "blocker" (same word as the diff label); a plain word, upper-cased by CSS
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("95% conf")).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Move the key to an environment variable.")).toBeInTheDocument();
  });

  it("prototype keys are not severities", () => {
    renderWithIntl(
      <FindingCard f={{ ...FINDING, severity: "constructor" as FindingRecord["severity"] }} onAction={() => {}} />,
    );
    expect(screen.getByText("info")).toBeInTheDocument();
  });

  it("an unknown severity falls back to the info word instead of crashing", () => {
    renderWithIntl(
      <FindingCard f={{ ...FINDING, severity: "WEIRD" as FindingRecord["severity"] }} onAction={() => {}} />,
    );
    expect(screen.getByText("info")).toBeInTheDocument();
  });
});

describe("FindingCard — disclosure", () => {
  it("the header is a button that toggles the body and reports aria-expanded", () => {
    renderWithIntl(<FindingCard f={FINDING} onAction={() => {}} />);
    const toggle = screen.getByRole("button", { name: /Hardcoded Stripe secret key/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});
