import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import common from "../../../../../../messages/en/common.json";
import { AgentSidebar } from "./AgentSidebar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const agent = (id: string, name: string): Agent => ({
  id,
  name,
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
});

describe("AgentSidebar", () => {
  it("lists agents as links that keep the current tab and marks the active one", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
          <AgentSidebar
            agents={[agent("a1", "Security Reviewer"), agent("a2", "Perf Reviewer")]}
            activeId="a2"
            tab="config"
            onToggle={() => {}}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Security Reviewer" })).toHaveAttribute("href", "/agents/a1?tab=config");
    const active = screen.getByRole("link", { name: "Perf Reviewer" });
    expect(active).toHaveAttribute("aria-current", "page");
  });
});
