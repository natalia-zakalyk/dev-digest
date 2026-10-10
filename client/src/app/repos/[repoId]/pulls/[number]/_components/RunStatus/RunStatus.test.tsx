import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const runEvents = vi.hoisted(() => ({ running: false }));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: runEvents.running }),
}));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  runEvents.running = false;
});

function ui(props: React.ComponentProps<typeof RunStatus>) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunStatus {...props} />
    </NextIntlClientProvider>
  );
}

describe("RunStatus", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = render(ui({ runIds: [] }));
    expect(container.firstChild).toBeNull();
  });

  it("calls onDone exactly once when streams close, across later re-renders", () => {
    const onDone = vi.fn();
    runEvents.running = true;
    const { rerender } = render(ui({ runIds: ["r1"], onDone }));
    expect(onDone).not.toHaveBeenCalled();

    runEvents.running = false;
    rerender(ui({ runIds: ["r1"], onDone }));
    expect(onDone).toHaveBeenCalledTimes(1);

    // Parent re-renders with fresh callback identities — no re-fire.
    const onDoneNew = vi.fn();
    rerender(ui({ runIds: ["r1"], onDone: onDoneNew }));
    rerender(ui({ runIds: ["r1"], onDone: onDoneNew }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDoneNew).not.toHaveBeenCalled();
  });

  it("never calls onDone if the run was never seen running", () => {
    const onDone = vi.fn();
    const { rerender } = render(ui({ runIds: ["r1"], onDone }));
    rerender(ui({ runIds: ["r1"], onDone }));
    expect(onDone).not.toHaveBeenCalled();
  });
});
