import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONV: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await",
  category: "async",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  evidence_line_start: 23,
  evidence_line_end: 31,
  confidence: 0.91,
  accepted: false,
  status: "pending",
};

function renderCard(over: Partial<ConventionCandidate> = {}) {
  const onSetStatus = vi.fn();
  const onEditRule = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard convention={{ ...CONV, ...over }} onSetStatus={onSetStatus} onEditRule={onEditRule} />
    </NextIntlClientProvider>,
  );
  return { onSetStatus, onEditRule };
}

describe("ConventionCard", () => {
  it("shows rule, category, evidence location, snippet and confidence", () => {
    renderCard();
    expect(screen.getByText("Always use async/await")).toBeInTheDocument();
    expect(screen.getByText("async")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("accepts, rejects, and toggles back to pending", () => {
    const { onSetStatus } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onSetStatus).toHaveBeenNthCalledWith(1, "accepted");
    expect(onSetStatus).toHaveBeenNthCalledWith(2, "rejected");
  });

  it("clicking an accepted card's button returns it to pending", () => {
    const { onSetStatus } = renderCard({ status: "accepted", accepted: true });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(onSetStatus).toHaveBeenCalledWith("pending");
  });

  it("edits the rule inline and saves only a changed, non-empty value", () => {
    const { onEditRule } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "  Prefer await  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEditRule).toHaveBeenCalledWith("Prefer await");
  });
});
