import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../messages/en/common.json";
import RouteError from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("app/error (route error boundary)", () => {
  it("shows a friendly error, logs it, and retries via reset", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const error = new Error("boom");
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <RouteError error={error} reset={reset} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(common.errors.title);
    expect(log).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
