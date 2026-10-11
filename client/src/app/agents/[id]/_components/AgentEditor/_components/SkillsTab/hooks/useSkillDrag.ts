/* useSkillDrag — reorder state of the Skills tab: native HTML5 drag-and-drop plus
   Alt + ↑/↓ on a row's handle. `dragFor(id)` returns the props one row needs. */
"use client";

import React from "react";
import type { SkillRowDrag } from "../_components/SkillRow";
import { moveItem } from "../helpers";

export function useSkillDrag(linkedIds: readonly string[], save: (ids: string[]) => void) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const reset = () => {
    setDragId(null);
    setOverId(null);
  };
  const move = (id: string, to: number) => save(moveItem(linkedIds, linkedIds.indexOf(id), to));

  const dragFor = (id: string): SkillRowDrag => ({
    dragging: dragId === id,
    over: overId === id && dragId !== id,
    onStart: (e) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    onOver: (e) => {
      if (!dragId) return;
      e.preventDefault();
      if (overId !== id) setOverId(id);
    },
    onDrop: () => {
      if (dragId && dragId !== id) move(dragId, linkedIds.indexOf(id));
      reset();
    },
    onEnd: reset,
    onHandleKey: (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const from = linkedIds.indexOf(id);
      move(id, e.key === "ArrowUp" ? from - 1 : from + 1);
    },
  });

  return dragFor;
}
