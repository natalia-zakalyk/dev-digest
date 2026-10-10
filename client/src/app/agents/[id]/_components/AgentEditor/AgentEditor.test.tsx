import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import common from "../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

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

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    render(wrap(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />));
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("resets the form when switching to another agent", () => {
    const { rerender } = render(wrap(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />));
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();

    const other: Agent = { ...AGENT, id: "ag2", name: "Perf Reviewer", description: "Finds slow code" };
    rerender(wrap(<AgentEditor agent={other} tab="config" onTab={() => {}} />));
    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Finds slow code")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Security Reviewer")).not.toBeInTheDocument();
  });
});
