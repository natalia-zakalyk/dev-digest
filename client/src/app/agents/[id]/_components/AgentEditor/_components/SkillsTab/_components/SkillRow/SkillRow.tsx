/* SkillRow — one skill in the agent's Skills tab: drag handle (linked only),
   link checkbox, "disabled globally" badge and type badge. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { s } from "./styles";

/** Drag-and-drop state and handlers of one row (only linked rows are draggable). */
export interface SkillRowDrag {
  dragging: boolean;
  over: boolean;
  onStart: (e: React.DragEvent) => void;
  onOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onEnd: () => void;
  onHandleKey: (e: React.KeyboardEvent) => void;
}

export function SkillRow({
  skill,
  linked,
  onToggle,
  drag,
}: {
  skill: Skill;
  linked: boolean;
  onToggle: () => void;
  drag: SkillRowDrag;
}) {
  const t = useTranslations("agents");
  return (
    <li
      data-testid={`skill-row-${skill.name}`}
      draggable={linked}
      onDragStart={linked ? drag.onStart : undefined}
      onDragOver={linked ? drag.onOver : undefined}
      onDrop={linked ? drag.onDrop : undefined}
      onDragEnd={drag.onEnd}
      style={s.row({ linked, dragging: drag.dragging, over: drag.over })}
    >
      {linked ? (
        <button
          type="button"
          aria-label={t("skills.dragHandle", { name: skill.name })}
          title={t("skills.dragHandle", { name: skill.name })}
          onKeyDown={drag.onHandleKey}
          style={s.handle}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        <span style={s.handlePlaceholder} />
      )}
      <Checkbox
        checked={linked}
        onChange={onToggle}
        label={
          <span className="mono" style={s.name(skill.enabled)}>
            {skill.name}
          </span>
        }
      />
      {!skill.enabled && (
        <Badge color="var(--text-muted)" bg="var(--bg-hover)" icon="EyeOff">
          {t("skills.disabledGlobally")}
        </Badge>
      )}
      <span style={s.typeCell}>
        <SkillTypeBadge type={skill.type} />
      </span>
    </li>
  );
}
