import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import { useSkillDrag } from "./useSkillDrag";

const IDS = ["a", "b", "c"];
const dragEvent = () =>
  ({ dataTransfer: { effectAllowed: "", setData: vi.fn() }, preventDefault: vi.fn() }) as unknown as React.DragEvent;
const keyEvent = (key: string, altKey = true) =>
  ({ key, altKey, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent;

describe("useSkillDrag", () => {
  it("drops a dragged row onto another and saves the new order", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useSkillDrag(IDS, save));
    act(() => result.current("a").onStart(dragEvent()));
    expect(result.current("a").dragging).toBe(true);
    act(() => result.current("c").onOver(dragEvent()));
    expect(result.current("c").over).toBe(true);
    act(() => result.current("c").onDrop());
    expect(save).toHaveBeenCalledWith(["b", "c", "a"]);
    expect(result.current("a").dragging).toBe(false);
  });

  it("does not save when dropping a row on itself, and onEnd clears the state", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useSkillDrag(IDS, save));
    act(() => result.current("b").onStart(dragEvent()));
    act(() => result.current("b").onDrop());
    expect(save).not.toHaveBeenCalled();
    act(() => result.current("b").onStart(dragEvent()));
    act(() => result.current("b").onEnd());
    expect(result.current("b").dragging).toBe(false);
  });

  it("moves a row with Alt+Arrow and ignores plain arrows", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useSkillDrag(IDS, save));
    act(() => result.current("b").onHandleKey(keyEvent("ArrowDown")));
    expect(save).toHaveBeenCalledWith(["a", "c", "b"]);
    save.mockClear();
    act(() => result.current("b").onHandleKey(keyEvent("ArrowUp", false)));
    expect(save).not.toHaveBeenCalled();
  });
});
