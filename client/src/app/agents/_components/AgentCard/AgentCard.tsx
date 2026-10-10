/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. The whole card is a link to
   the agent editor (stretched-link pattern: one real <a> on the name, overlaid
   on the card); the toggle and delete button sit above the overlay. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  href,
  active,
  skillCount,
  onToggle,
}: {
  ag: Agent;
  /** Where the card navigates (the agent editor). Without it the card is static. */
  href?: string;
  active?: boolean;
  skillCount?: number;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const color = modelColor(ag.model);

  const [confirming, setConfirming] = React.useState(false);
  const cancelDelete = React.useCallback(() => setConfirming(false), []);
  const handleDelete = () => del.mutate(ag.id, { onSettled: () => setConfirming(false) });

  return (
    <div style={s.card(!!active, ag.enabled, !!href)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        {href ? (
          <Link
            href={href}
            className="dd-stretched-link"
            aria-current={active ? "page" : undefined}
            style={s.name}
          >
            {ag.name}
          </Link>
        ) : (
          <span style={s.name}>{ag.name}</span>
        )}
        {onToggle && (
          <div style={s.raised}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={del.isPending}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spinning : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title={t("card.deleteTitle", { name: ag.name })}
        body={t("card.deleteBody")}
        confirmLabel={t("card.deleteConfirm")}
        danger
        pending={del.isPending}
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
