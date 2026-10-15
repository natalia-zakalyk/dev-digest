import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../messages/en/onboarding.json";
import { ApiError } from "@/lib/api";
import { AddRepoView } from "./AddRepoView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/core", () => ({ useAddRepo: () => ({ mutateAsync, isPending: false }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsync.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <AddRepoView />
    </NextIntlClientProvider>,
  );
}

describe("AddRepoView", () => {
  it("adds a repo from the URL field and opens its PR list", async () => {
    mutateAsync.mockResolvedValue({ id: "r1" });
    renderView();
    expect(screen.getByRole("heading", { name: "Add a repository" })).toBeInTheDocument();
    expect(screen.getByText("Repository URL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");

    const submit = screen.getByRole("button", { name: "Add repository" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "  https://github.com/acme/api  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(mutateAsync).toHaveBeenCalledWith("https://github.com/acme/api");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/repos/r1/pulls"));
  });

  it("shows the server's error message inline when adding fails", async () => {
    mutateAsync.mockRejectedValue(new ApiError("Not a GitHub URL", 400));
    renderView();
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not a GitHub URL");
    expect(push).not.toHaveBeenCalled();
  });

  it("closes back to the app on Esc", () => {
    renderView();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/");
  });
});
