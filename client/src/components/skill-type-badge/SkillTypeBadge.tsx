/* SkillTypeBadge — coloured mono badge for a skill's type (rubric / convention /
   security / custom). Shared by the Skills page and the agent editor's Skills tab. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLORS } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("common");
  const { color, bg } = SKILL_TYPE_COLORS[type];
  return (
    <Badge color={color} bg={bg} mono>
      {t(`skillType.${type}`)}
    </Badge>
  );
}
