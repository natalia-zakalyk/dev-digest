/* InjectionBanner — full-width red alert: "INJECTION DETECTED — DO NOT ENABLE …" plus the reasons,
   so the user knows what to remove. Renders nothing for a clean skill. */
"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SkillInjection } from "@devdigest/shared";

const s = {
  root: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 20px",
    background: "var(--crit-bg)",
    borderBottom: "2px solid var(--crit)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  icon: { color: "var(--crit)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  title: { color: "var(--crit)", fontWeight: 700, letterSpacing: "0.01em", marginRight: 8 } satisfies CSSProperties,
  reasons: { margin: "4px 0 0", paddingLeft: 18, color: "var(--text-muted)", fontSize: 12.5 } satisfies CSSProperties,
} as const;

export function InjectionBanner({ injection }: { injection?: SkillInjection }) {
  const t = useTranslations("common");
  if (!injection?.detected) return null;
  return (
    <div role="alert" style={s.root} data-testid="injection-banner">
      <Icon.AlertOctagon size={18} style={s.icon} />
      <div>
        <div>
          <span style={s.title}>{t("skillInjection.bannerTitle")}</span>
          {t("skillInjection.bannerBody")}
        </div>
        {injection.reasons.length > 0 && (
          <ul style={s.reasons}>
            {injection.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
