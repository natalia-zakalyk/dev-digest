import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/agents.json";
import { CreateAgentModal } from "./CreateAgentModal";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({ useCreateAgent: () => ({ mutateAsync, isPending: false }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsync.mockReset();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("CreateAgentModal", () => {
  it("creates an agent with defaults for a blank name, then opens its editor", async () => {
    mutateAsync.mockResolvedValue({ id: "ag9" });
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText("What this agent reviews"), { target: { value: "Secrets" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      name: "New Agent",
      description: "Secrets",
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: messages.create.defaultSystemPrompt,
    });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/agents/ag9?tab=config"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without creating on Cancel", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
