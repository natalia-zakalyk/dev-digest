import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, fireEvent, cleanup } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
});

function setup() {
  const handlers = { onOpenPalette: vi.fn(), onOpenHelp: vi.fn() };
  renderHook(() => useGlobalShortcuts(handlers));
  return handlers;
}

describe("useGlobalShortcuts", () => {
  it("navigates with g-then-key chords (repo-scoped routes use the active repo)", () => {
    setup();
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "a" });
    expect(push).toHaveBeenLastCalledWith("/agents");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "p" });
    expect(push).toHaveBeenLastCalledWith("/repos/r1/pulls");
  });

  it("ignores chords typed into a text field", () => {
    setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "a" });
    expect(push).not.toHaveBeenCalled();
    input.remove();
  });

  it("opens the palette on Cmd/Ctrl+K (even in inputs) and help on ?", () => {
    const { onOpenPalette, onOpenHelp } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "k", metaKey: true });
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "?" });
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    input.remove();
  });
});
