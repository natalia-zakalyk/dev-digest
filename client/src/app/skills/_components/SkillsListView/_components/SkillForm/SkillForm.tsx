/* SkillForm — the four skill fields (name, description, type, body with Write / Preview), shared by
   the Add skill modal (Create tab and the pre-filled URL import) and the edit modal.
   Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, Markdown, SelectInput, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../constants";
import { BODY_ROWS, type BodyMode } from "./constants";
import { s } from "./styles";

export interface SkillFields {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function SkillForm({
  value,
  onChange,
  bodyHint,
}: {
  value: SkillFields;
  onChange: (next: SkillFields) => void;
  /** Shown under the body (e.g. "Changing the body creates a new skill version." when editing). */
  bodyHint?: string;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const [mode, setMode] = React.useState<BodyMode>("write");
  const set = <K extends keyof SkillFields>(key: K, v: SkillFields[K]) => onChange({ ...value, [key]: v });

  return (
    <>
      <FormField label={t("editor.name")} required>
        <TextInput value={value.name} onChange={(v) => set("name", v)} placeholder={t("editor.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
        <Textarea
          value={value.description}
          onChange={(v) => set("description", v)}
          rows={2}
          placeholder={t("editor.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput
          value={value.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((v) => ({ value: v, label: tc(`skillType.${v}`) }))}
        />
      </FormField>
      <FormField
        label={t("editor.body")}
        required
        hint={bodyHint}
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
          <Textarea value={value.body} onChange={(v) => set("body", v)} rows={BODY_ROWS} mono />
        ) : (
          <div style={s.preview}>
            {value.body.trim() ? <Markdown>{value.body}</Markdown> : <span style={s.muted}>{t("editor.emptyPreview")}</span>}
          </div>
        )}
      </FormField>
    </>
  );
}
