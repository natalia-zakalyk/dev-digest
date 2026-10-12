/* FileTab — add a skill from a `.md` or `.zip` file. Only those two types are accepted (checked in code,
   not just by the input's `accept`). The file is parsed server-side (POST /skills/import/preview) and its
   text lands in an editable "Skill body" field; "Import skill" saves it (source imported_file). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { InjectionBanner } from "@/components/skill-injection";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "../../../../constants";
import { ACCEPT, MAX_IMPORT_BYTES } from "../../constants";
import { isAllowedSkillFile, readFileAsBase64 } from "../../helpers";
import { s } from "./styles";

export function FileTab({ onSaved }: { onSaved: (id: string) => void }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const toast = useToast();
  const previewImport = useImportSkillPreview();
  const create = useCreateSkill();
  const [skillName, setSkillName] = React.useState("");
  const [type, setType] = React.useState<SkillType>("rubric");
  const [typeTouched, setTypeTouched] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setBody("");
    setFileName(null);
  };

  const onPick = async (file: File | undefined) => {
    setError(null);
    if (!file) return reset();
    if (!isAllowedSkillFile(file.name)) {
      reset();
      return setError(t("add.file.badType"));
    }
    if (file.size > MAX_IMPORT_BYTES) {
      reset();
      return setError(t("import.fileHint"));
    }
    setFileName(file.name);
    let content_base64: string;
    try {
      content_base64 = await readFileAsBase64(file);
    } catch {
      reset();
      return setError(t("import.readFailed"));
    }
    previewImport.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setPreview(p);
          setBody(p.body);
          if (!typeTouched) setType(p.type);
        },
        onError: reset,
      },
    );
  };

  const submit = () => {
    if (!preview || !body.trim()) return;
    create.mutate(
      {
        name: skillName.trim() || preview.name,
        description: preview.description,
        type,
        body,
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

  // The scan covers the file's text; once the user edits the body it is no longer what was scanned.
  const showInjection = !!preview?.injection?.detected && body === preview.body;

  return (
    <div>
      <FormField label={t("add.file.nameLabel")} hint={t("add.file.nameHint")}>
        <TextInput value={skillName} onChange={setSkillName} placeholder={t("editor.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput
          value={type}
          onChange={(v) => {
            setType(v as SkillType);
            setTypeTouched(true);
          }}
          options={SKILL_TYPES.map((v) => ({ value: v, label: tc(`skillType.${v}`) }))}
        />
      </FormField>
      <FormField label={t("add.file.fileLabel")}>
        <input
          type="file"
          accept={ACCEPT}
          aria-label={t("import.fileLabel")}
          onChange={(e) => {
            void onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {fileName && <div style={s.file}>{previewImport.isPending ? t("import.parsing", { file: fileName }) : fileName}</div>}
        {error && (
          <p role="alert" style={s.error}>
            {error}
          </p>
        )}
      </FormField>

      {preview && (
        <>
          <div role="note" style={s.trust}>
            <Icon.AlertTriangle size={15} style={s.trustIcon} />
            <div>
              <div style={s.trustTitle}>{t("import.trustTitle")}</div>
              {t("import.trustBody")}
            </div>
          </div>
          {showInjection && (
            <div style={s.banner}>
              <InjectionBanner injection={preview.injection} />
            </div>
          )}
          {preview.ignored_files.length > 0 && (
            <div style={s.box}>
              <div style={s.boxTitle}>{t("import.ignoredTitle", { count: preview.ignored_files.length })}</div>
              {t("import.ignoredHint")}
              <ul style={s.list}>
                {preview.ignored_files.map((f) => (
                  <li key={f} className="mono" style={s.ignored}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div style={s.box}>
              <div style={s.boxTitle}>{t("import.warnings")}</div>
              <ul style={s.list}>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <FormField label={t("import.bodyPreview")} required>
            <Textarea value={body} onChange={setBody} rows={12} mono />
          </FormField>
        </>
      )}

      <Button kind="primary" icon="Upload" full onClick={submit} disabled={!preview || !body.trim() || create.isPending}>
        {create.isPending ? t("import.saving") : t("add.file.import")}
      </Button>
    </div>
  );
}
