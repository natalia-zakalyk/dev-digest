import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import settings from "../../../../../../../../messages/en/settings.json";
import { SettingsApiKeys } from "./SettingsApiKeys";

vi.mock("@/lib/hooks/core", () => ({
  useTestConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSecretsStatus: () => ({ data: { openai: true, anthropic: false, openrouter: false, github: false } }),
}));

afterEach(cleanup);

describe("SettingsApiKeys", () => {
  it("shows key status and toggles key visibility with a pressed-state button", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ settings }}>
        <SettingsApiKeys />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "API Keys" })).toBeInTheDocument();
    expect(screen.getAllByText("Configured").length).toBeGreaterThan(0);

    const [toggle] = screen.getAllByRole("button", { name: "Show key" });
    const [input] = screen.getAllByPlaceholderText(settings.apiKeys.placeholder);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(toggle!);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(input).toHaveAttribute("type", "text");
  });
});
