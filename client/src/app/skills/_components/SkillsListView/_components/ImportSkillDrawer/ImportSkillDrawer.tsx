/* ImportSkillDrawer — import a skill from a .md file or a .zip with a SKILL.md.
   1) pick a file → the server extracts the skill core (writes nothing);
   2) preview: editable name / description / type, rendered body, warnings, the
      archive entries that were ignored (never executed or stored), trust banner;
   3) Save creates the skill (source imported_file); Cancel writes nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, Icon, Markdown, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "../../constants";
import { ACCEPT, DRAWER_WIDTH, MAX_IMPORT_BYTES } from "./constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const toast = useToast();
  const previewImport = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string>();
  const [preview, setPreview] = React.useState<SkillImportPreview>();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPreview(undefined);
    setFileName(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error(t("import.fileHint"));
      return;
    }
    let content: string;
    try {
      content = await readFileAsBase64(file);
    } catch {
      toast.error(t("import.readFailed"));
      return;
    }
    // Errors (422: no SKILL.md, too large, …) surface via the global mutation toast.
    previewImport.mutate(
      { filename: file.name, content_base64: content },
      {
        onSuccess: (p) => {
          setPreview(p);
          setName(p.name);
          setDescription(p.description);
          setType(p.type);
        },
      },
    );
  };

  const save = () => {
    if (!preview || !name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        body: preview.body,
        source: "imported_file",
      },
      {
        onSuccess: (saved) => {
          toast.success(t("import.saved", { name: saved.name }));
          onSaved(saved.id);
        },
      },
    );
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            onClick={save}
            disabled={!preview || !name.trim() || create.isPending}
          >
            {create.isPending ? t("import.saving") : t("import.save")}
          </Button>
        </div>
      }
    >
      <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
        <div style={s.fileRow}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            aria-label={t("import.fileLabel")}
            style={s.hiddenInput}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button icon="Upload" onClick={() => inputRef.current?.click()}>
            {t("import.choose")}
          </Button>
          {fileName && <span className="mono" style={s.fileName}>{fileName}</span>}
        </div>
      </FormField>

      {previewImport.isPending && fileName && (
        <p style={s.muted}>{t("import.parsing", { file: fileName })}</p>
      )}

      {preview && (
        <>
          <div role="note" style={s.trust}>
            <Icon.AlertTriangle size={16} style={s.trustIcon} />
            <div>
              <div style={s.trustTitle}>{t("import.trustTitle")}</div>
              <div>{t("import.trustBody")}</div>
            </div>
          </div>

          <p className="mono" style={s.muted}>
            {t("import.sourceFile", { file: preview.source_file })}
          </p>

          {preview.ignored_files.length > 0 && (
            <section style={s.box} aria-label={t("import.ignoredTitle", { count: preview.ignored_files.length })}>
              <div style={s.boxTitle}>
                {t("import.ignoredTitle", { count: preview.ignored_files.length })}
              </div>
              <div style={s.muted}>{t("import.ignoredHint")}</div>
              <ul style={s.list}>
                {preview.ignored_files.map((f) => (
                  <li key={f} className="mono" style={s.ignored}>
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preview.warnings.length > 0 && (
            <section style={s.box}>
              <div style={s.boxTitle}>{t("import.warnings")}</div>
              <ul style={s.list}>
                {preview.warnings.map((w) => (
                  <li key={w} style={s.warning}>
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <FormField label={t("editor.name")} required>
            <TextInput value={name} onChange={setName} mono />
          </FormField>
          <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
            <Textarea value={description} onChange={setDescription} rows={2} />
          </FormField>
          <FormField label={t("editor.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPES.map((v) => ({ value: v, label: tc(`skillType.${v}`) }))}
            />
          </FormField>
          <FormField label={t("import.bodyPreview")}>
            <div style={s.body}>
              <Markdown>{preview.body}</Markdown>
            </div>
          </FormField>
        </>
      )}
    </Drawer>
  );
}
