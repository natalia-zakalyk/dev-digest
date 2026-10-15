/* SkillCard — list row: type-coloured icon, name, global "enabled" toggle, 1-line
   description, type badge + source, and a footer with 30-day usage numbers.
   The whole card selects the skill (stretched-button pattern: one real <button> on the
   name, overlaid on the card); the toggle sits above the overlay. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill, SkillSummary } from "@devdigest/shared";
import { SkillTypeBadge, SKILL_TYPE_COLORS } from "@/components/skill-type-badge";
import { InjectionBadge } from "@/components/skill-injection";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SOURCE_ICONS } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  summary,
  selected = false,
  onOpen,
  onToggle,
  onDelete,
  deleting = false,
}: {
  skill: Skill;
  summary?: SkillSummary;
  selected?: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  /** Called after the user confirms the delete dialog. */
  onDelete: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const SourceIcon = Icon[SOURCE_ICONS[skill.source]];
  const { color, bg } = SKILL_TYPE_COLORS[skill.type];
  const [confirming, setConfirming] = React.useState(false);
  const cancelDelete = React.useCallback(() => setConfirming(false), []);
  const handleDelete = () => {
    onDelete();
    setConfirming(false);
  };
  const pull = summary?.pull_frequency;
  const accept = summary?.accept_rate;
  return (
    <div style={s.card(skill.enabled, selected, !!skill.injection?.detected)} data-flagged={skill.injection?.detected || undefined}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color, bg)}>
          <Icon.Sparkles size={14} />
        </div>
        <button type="button" className="dd-stretched-link mono" aria-current={selected || undefined} onClick={onOpen} style={s.name}>
          {skill.name}
        </button>
        <button
          type="button"
          style={{ ...s.raised, ...s.deleteBtn }}
          aria-label={t("card.delete", { name: skill.name })}
          title={t("card.delete", { name: skill.name })}
          disabled={deleting}
          onClick={() => setConfirming(true)}
        >
          <Icon.Trash size={14} />
        </button>
        <label style={s.raised} title={t("card.enabledLabel", { name: skill.name })}>
          <span style={s.srOnly}>{t("card.enabledLabel", { name: skill.name })}</span>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </label>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span className="mono" style={s.source} data-testid="skill-card-version">
          <Icon.GitCommit size={12} />
          {t("preview.version", { version: skill.version })}
        </span>
        <InjectionBadge injection={skill.injection} />
        <span style={s.source}>
          <SourceIcon size={12} />
          {tc(`skillSource.${skill.source}`)}
        </span>
      </div>
      <div style={s.footer} data-testid="skill-card-summary">
        {summary ? (
          <>
            <span>{t("card.agents", { count: summary.agents_count })}</span>
            {pull != null && <span>{t("card.pull", { value: Math.round(pull) })}</span>}
            {accept != null && <span style={s.accept}>{t("card.accept", { value: Math.round(accept) })}</span>}
          </>
        ) : (
          <span>{t("card.noStats")}</span>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title={t("preview.deleteTitle", { name: skill.name })}
        body={t("preview.deleteBody")}
        confirmLabel={t("preview.deleteConfirm")}
        danger
        pending={deleting}
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
