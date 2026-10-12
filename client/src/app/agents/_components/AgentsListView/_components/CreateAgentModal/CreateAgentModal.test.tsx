import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/agents.json";
import { CreateAgentModal } from "./CreateAgentModal";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const mutateAsync = vi.fn();

// Live model lists per provider (what GET /providers/:provider/models returns).
let MODELS: Record<string, { id: string }[] | undefined> = {
  openai: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
  anthropic: [{ id: "claude-opus-4-1" }, { id: "claude-sonnet-4-5" }],
  openrouter: [{ id: "deepseek/deepseek-v4-flash" }, { id: "anthropic/claude-sonnet-4-6" }],
};
vi.mock("@/lib/hooks/agents", () => ({
  useCreateAgent: () => ({ mutateAsync, isPending: false }),
  useProviderModels: (p: string) => ({ data: MODELS[p], isLoading: MODELS[p] === undefined }),
}));

const ORIGINAL = MODELS;
afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsync.mockReset();
  MODELS = ORIGINAL;
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

const openModelList = () => fireEvent.click(screen.getByText("gpt-4.1").closest("div[style*='cursor']")!);

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

  it("offers the provider's live models in a searchable dropdown and submits the picked one", async () => {
    mutateAsync.mockResolvedValue({ id: "ag1" });
    renderModal();
    openModelList();
    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    fireEvent.click(screen.getByText("gpt-4.1-mini"));
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ provider: "openai", model: "gpt-4.1-mini" });
  });

  it("switching the provider swaps the model list and selects that provider's default model", () => {
    mutateAsync.mockResolvedValue({ id: "ag2" });
    renderModal();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
    // The previous provider's model is gone; the Anthropic default is selected.
    expect(screen.queryByText("gpt-4.1")).not.toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ provider: "anthropic", model: "claude-sonnet-4-5" });
  });

  it("falls back to the first listed model when the provider does not offer the preferred one", () => {
    MODELS = { ...ORIGINAL, anthropic: [{ id: "claude-opus-4-1" }] };
    mutateAsync.mockResolvedValue({ id: "ag3" });
    renderModal();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(mutateAsync.mock.calls[0]![0].model).toBe("claude-opus-4-1");
  });

  it("with no models (provider key missing) shows a hint and keeps a text field so an agent can still be created", () => {
    MODELS = { ...ORIGINAL, anthropic: [] };
    mutateAsync.mockResolvedValue({ id: "ag4" });
    renderModal();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
    expect(screen.getByText(/No models loaded — set the anthropic API key/)).toBeInTheDocument();
    const input = screen.getByDisplayValue("claude-sonnet-4-5");
    fireEvent.change(input, { target: { value: "my-custom-model" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(mutateAsync.mock.calls[0]![0].model).toBe("my-custom-model");
  });

  it("closes without creating on Cancel", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
