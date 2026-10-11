/* SkillEditorModal — create or edit a skill: name, description (the skill's
   interface — phrased as a directive), type, markdown body with Write / Preview.
   Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Markdown, Modal, SelectInput, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "../../constants";
import { BODY_ROWS, MODAL_WIDTH, type BodyMode } from "./constants";
import { s } from "./styles";

export function SkillEditorModal({ skill, onClose }: { skill?: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? "rubric");
  const [body, setBody] = React.useState(skill?.body ?? "");
  const [changeNote, setChangeNote] = React.useState("");
  const [mode, setMode] = React.useState<BodyMode>("write");

  const pending = create.isPending || update.isPending;
  const valid = name.trim().length > 0 && body.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const fields = { name: name.trim(), description: description.trim(), type, body };
    if (skill) {
      const note = changeNote.trim();
      const patch = body !== skill.body && note ? { ...fields, change_note: note } : fields;
      update.mutate(
        { id: skill.id, patch },
        {
          onSuccess: (saved) => {
            toast.success(t("editor.saved", { version: saved.version }));
            onClose();
          },
        },
      );
    } else {
      create.mutate(fields, {
        onSuccess: (saved) => {
          toast.success(t("editor.created", { name: saved.name }));
          onClose();
        },
      });
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={skill ? t("editor.editTitle") : t("editor.createTitle")}
      subtitle={t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {!valid && <span style={s.invalid}>{t("editor.required")}</span>}
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={!valid || pending}>
            {pending ? t("editor.saving") : skill ? t("editor.save") : t("editor.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("editor.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("editor.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
          <Textarea
            value={description}
            onChange={setDescription}
            rows={2}
            placeholder={t("editor.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("editor.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={SKILL_TYPES.map((v) => ({ value: v, label: tc(`skillType.${v}`) }))}
          />
        </FormField>
        <FormField
          label={t("editor.body")}
          required
          hint={skill ? t("editor.bodyHint") : undefined}
          right={
            <Tabs
              tabs={[
                { key: "write", label: t("editor.write") },
                { key: "preview", label: t("editor.previewTab") },
              ]}
              value={mode}
              onChange={(k) => setMode(k as BodyMode)}
              pad="0"
            />
          }
        >
          {mode === "write" ? (
            <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
          ) : (
            <div style={s.preview}>
              {body.trim() ? <Markdown>{body}</Markdown> : <span style={s.muted}>{t("editor.emptyPreview")}</span>}
            </div>
          )}
        </FormField>
        {skill && (
          <FormField label={t("editor.changeNote")} hint={t("editor.changeNoteHint")}>
            <TextInput value={changeNote} onChange={setChangeNote} placeholder={t("editor.changeNotePlaceholder")} />
          </FormField>
        )}
      </div>
    </Modal>
  );
}
