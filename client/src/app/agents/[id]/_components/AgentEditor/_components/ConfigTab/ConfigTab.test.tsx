import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import common from "../../../../../../../../messages/en/common.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));
const success = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success }) }));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  success.mockReset();
});

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

function renderTab(agent: Agent = AGENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <ConfigTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("saves the edited fields and confirms with a toast", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Secrets Reviewer" } });
    fireEvent.change(screen.getByDisplayValue("You are a security reviewer."), {
      target: { value: "Find leaked secrets." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save agent" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [payload, opts] = mutate.mock.calls[0]!;
    expect(payload).toEqual({
      id: "ag1",
      patch: {
        name: "Secrets Reviewer",
        description: "Flags secrets and injection",
        provider: "openai",
        model: "gpt-4.1",
        system_prompt: "Find leaked secrets.",
        strategy: "single-pass",
        ci_fail_on: "critical",
        repo_intel: true,
        enabled: true,
      },
    });

    opts.onSuccess({ ...AGENT, version: 2 });
    expect(success).toHaveBeenCalledWith("Agent saved (v2)");
  });
});
