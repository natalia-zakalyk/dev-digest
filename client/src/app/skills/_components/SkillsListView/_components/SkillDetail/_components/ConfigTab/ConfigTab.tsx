/* ConfigTab — skill metadata: source, global enabled switch, description, trust
   notice for imported skills; Edit (opens the editor modal) and Delete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { isExternalSource } from "./constants";
import { s } from "./styles";

export function ConfigTab({
  skill,
  onEdit,
  onDeleted,
  onToggle,
}: {
  skill: Skill;
  onEdit: () => void;
  onDeleted: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const cancelDelete = React.useCallback(() => setConfirming(false), []);
  const external = isExternalSource(skill.source);

  const handleDelete = () =>
    del.mutate(skill.id, {
      onSuccess: onDeleted,
      onSettled: () => setConfirming(false),
    });

  return (
    <div>
      <div style={s.row}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {t("preview.source", { source: tc(`skillSource.${skill.source}`) })}
        </span>
        {external && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
        )}
        <label style={s.enabled}>
          {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </label>
      </div>
      {external && <div style={s.notice}>{t("preview.untrustedNotice")}</div>}
      <h3 style={s.h3}>{t("preview.description")}</h3>
      <p style={s.description}>{skill.description || "—"}</p>
      <div style={s.actions}>
        <Button kind="ghost" icon="Trash" onClick={() => setConfirming(true)} disabled={del.isPending}>
          {t("preview.delete")}
        </Button>
        <Button kind="primary" icon="Edit" onClick={onEdit}>
          {t("preview.edit")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t("preview.deleteTitle", { name: skill.name })}
        body={t("preview.deleteBody")}
        confirmLabel={t("preview.deleteConfirm")}
        danger
        pending={del.isPending}
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
