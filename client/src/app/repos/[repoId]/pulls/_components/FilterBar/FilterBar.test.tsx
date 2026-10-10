import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../messages/en/prReview.json";
import { FilterBar } from "./FilterBar";

afterEach(cleanup);

function renderBar(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props: React.ComponentProps<typeof FilterBar> = {
    active: "needs_review",
    onActive: vi.fn(),
    query: "",
    onQuery: vi.fn(),
    sort: "newest",
    onSort: vi.fn(),
    onRefresh: vi.fn(),
    refreshing: false,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <FilterBar {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("FilterBar", () => {
  it("reports search text, status chip and refresh clicks", () => {
    const props = renderBar();
    fireEvent.change(screen.getByPlaceholderText(prReview.list.filterPlaceholder), { target: { value: "rate" } });
    expect(props.onQuery).toHaveBeenCalledWith("rate");

    fireEvent.click(screen.getByText(prReview.list.filter.all));
    expect(props.onActive).toHaveBeenCalledWith("all");

    fireEvent.click(screen.getByRole("button", { name: prReview.list.refresh }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("disables refresh while a refresh is running", () => {
    renderBar({ refreshing: true });
    expect(screen.getByRole("button", { name: prReview.list.refreshing })).toBeDisabled();
  });
});
