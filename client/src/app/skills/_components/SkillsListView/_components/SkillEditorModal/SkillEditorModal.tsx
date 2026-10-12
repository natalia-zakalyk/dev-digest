/* SkillEditorModal — edit an existing skill: name, description (the skill's interface —
   phrased as a directive), type, markdown body with Write / Preview, and an optional change note.
   Creating a skill lives in AddSkillModal. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillForm, type SkillFields } from "../SkillForm";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function SkillEditorModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [fields, setFields] = React.useState<SkillFields>({
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
  });
  const [changeNote, setChangeNote] = React.useState("");

  const valid = fields.name.trim().length > 0 && fields.body.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const next = { name: fields.name.trim(), description: fields.description.trim(), type: fields.type, body: fields.body };
    const note = changeNote.trim();
    const patch = fields.body !== skill.body && note ? { ...next, change_note: note } : next;
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (saved) => {
          toast.success(t("editor.saved", { version: saved.version }));
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("editor.editTitle")}
      subtitle={t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {!valid && <span style={s.invalid}>{t("editor.required")}</span>}
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={!valid || update.isPending}>
            {update.isPending ? t("editor.saving") : t("editor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillForm value={fields} onChange={setFields} bodyHint={t("editor.bodyHint")} />
        <FormField label={t("editor.changeNote")} hint={t("editor.changeNoteHint")}>
          <TextInput value={changeNote} onChange={setChangeNote} placeholder={t("editor.changeNotePlaceholder")} />
        </FormField>
      </div>
    </Modal>
  );
}
