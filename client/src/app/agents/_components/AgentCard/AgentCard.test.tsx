import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import common from "../../../../../messages/en/common.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("links the card to the agent editor and keeps the toggle outside the link", () => {
    const onToggle = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} href="/agents/ag1?tab=config" active onToggle={onToggle} />);
    const link = screen.getByRole("link", { name: "Security Reviewer" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=config");
    expect(link).toHaveAttribute("aria-current", "page");
    const deleteBtn = screen.getByRole("button", { name: "Delete agent" });
    expect(deleteBtn.closest("a")).toBeNull();
  });

  it("asks for confirmation in a dialog before deleting", async () => {
    const fetchSpy = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(screen.getByText('Delete agent "Security Reviewer"?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText('Delete agent "Security Reviewer"?')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
