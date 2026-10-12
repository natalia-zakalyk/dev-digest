/* InjectionBadge — red "Injection detected" flag for a skill the injection gate blocked.
   Shared by the Skills list/detail and the agent Skills tab. Spec: client/specs/skills.md */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillInjection } from "@devdigest/shared";

export function InjectionBadge({ injection }: { injection?: SkillInjection }) {
  const t = useTranslations("common");
  if (!injection?.detected) return null;
  return (
    <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertOctagon" style={{ border: "1px solid var(--crit)" }}>
      <span title={injection.reasons.join("\n")}>{t("skillInjection.badge")}</span>
    </Badge>
  );
}
