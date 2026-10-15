import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { AgentEditorHeader } from "./AgentEditorHeader";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: false,
  version: 1,
};

describe("AgentEditorHeader", () => {
  it("shows name, provider/model, the disabled marker and a Run on a PR shortcut", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <AgentEditorHeader agent={AGENT} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run on a PR…" }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
