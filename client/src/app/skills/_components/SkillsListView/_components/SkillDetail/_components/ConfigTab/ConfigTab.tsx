/* ConfigTab — the skill's inline editor (as in the design): "Configuration vN" + global Enabled switch,
   Name, Description, Type and the Skill body editor. Saving writes a new version when the body changed;
   Delete asks for confirmation. Imported skills keep their trust notice. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "../../../../constants";
import { BodyEditor } from "./_components/BodyEditor";
import { isExternalSource } from "./constants";
import { s } from "./styles";

export function ConfigTab({
  skill,
  onDeleted,
  onToggle,
}: {
  skill: Skill;
  onDeleted: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const toast = useToast();
  const del = useDeleteSkill();
  const update = useUpdateSkill();
  const [confirming, setConfirming] = React.useState(false);
  const cancelDelete = React.useCallback(() => setConfirming(false), []);
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const external = isExternalSource(skill.source);

  // A save (or restore) bumps the version: re-seed the form from the saved skill.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
  }, [skill.version, skill.name, skill.description, skill.type, skill.body]);

  const bodyDirty = body !== skill.body;
  const dirty = bodyDirty || name !== skill.name || description !== skill.description || type !== skill.type;
  const valid = name.trim().length > 0 && body.trim().length > 0;

  const save = () => {
    if (!valid || !dirty) return;
    update.mutate(
      { id: skill.id, patch: { name: name.trim(), description: description.trim(), type, body } },
      { onSuccess: (saved) => toast.success(t("editor.saved", { version: saved.version })) },
    );
  };
  const reset = () => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
  };
  const handleDelete = () =>
    del.mutate(skill.id, {
      onSuccess: onDeleted,
      onSettled: () => setConfirming(false),
    });

  return (
    <div>
      <div style={s.row}>
        <h3 style={s.heading}>{t("config.heading")}</h3>
        <span className="mono" style={s.version}>
          <Icon.GitCommit size={12} />
          {t("preview.version", { version: skill.version })}
        </span>
        <label style={s.enabled}>
          {t("preview.enabled")}
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </label>
      </div>
      <div style={s.row}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {t("preview.source", { source: tc(`skillSource.${skill.source}`) })}
        </span>
        {external && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
        )}
      </div>
      {external && <div style={s.notice}>{t("preview.untrustedNotice")}</div>}

      <FormField label={t("editor.name")} required>
        <TextInput value={name} onChange={setName} placeholder={t("editor.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} placeholder={t("editor.descriptionPlaceholder")} />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={SKILL_TYPES.map((v) => ({ value: v, label: tc(`skillType.${v}`) }))}
        />
      </FormField>
      <FormField label={t("config.body")} required hint={t("editor.bodyHint")}>
        <BodyEditor fileName={`${name.trim() || skill.name}.md`} value={body} dirty={bodyDirty} onChange={setBody} />
      </FormField>

      <div style={s.actions}>
        <Button kind="ghost" icon="Trash" onClick={() => setConfirming(true)} disabled={del.isPending}>
          {t("preview.delete")}
        </Button>
        <div style={s.right}>
          {!valid && <span style={s.invalid}>{t("editor.required")}</span>}
          <Button kind="ghost" onClick={reset} disabled={!dirty || update.isPending}>
            {t("config.reset")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!valid || !dirty || update.isPending}>
            {update.isPending ? t("editor.saving") : t("editor.save")}
          </Button>
        </div>
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
