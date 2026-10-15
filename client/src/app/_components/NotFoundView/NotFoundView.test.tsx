import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en/common.json";
import { NotFoundView } from "./NotFoundView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// The shell (nav, palette, repo context) is out of scope here.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

describe("NotFoundView", () => {
  it("explains the page is missing and links back home", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <NotFoundView />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(common.errors.notFoundTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: common.errors.goHome }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
