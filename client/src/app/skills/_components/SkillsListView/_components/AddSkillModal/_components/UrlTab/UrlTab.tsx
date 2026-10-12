/* UrlTab — URL + skill name. "Import from URL" asks the server to fetch the GitHub-hosted file
   (POST /skills/import/url, nothing is saved), then hands the result to the standard create form,
   pre-filled, with the injection scan attached. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import { useImportSkillFromUrl } from "@/lib/hooks/skills";
import { isHttpsUrl } from "../../helpers";
import type { Prefill } from "../CreateTab";
import { s } from "./styles";

export function UrlTab({ onImported }: { onImported: (prefill: Prefill) => void }) {
  const t = useTranslations("skills");
  const importUrl = useImportSkillFromUrl();
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");

  const submit = () => {
    if (!isHttpsUrl(url)) return;
    importUrl.mutate(
      { url: url.trim(), ...(name.trim() ? { name: name.trim() } : {}) },
      {
        onSuccess: (p) =>
          onImported({
            name: p.name,
            description: p.description,
            type: p.type,
            body: p.body,
            source: "imported_url",
            injection: p.injection,
          }),
      },
    );
  };

  return (
    <div>
      <p style={s.hint}>{t("add.url.hint")}</p>
      <FormField label={t("add.url.urlLabel")}>
        <TextInput
          type="url"
          value={url}
          onChange={setUrl}
          placeholder={t("add.url.urlPlaceholder")}
          aria-label={t("add.url.urlLabel")}
          mono
        />
      </FormField>
      <FormField label={t("add.url.nameLabel")}>
        <TextInput value={name} onChange={setName} placeholder={t("add.url.namePlaceholder")} aria-label={t("add.url.nameLabel")} mono />
      </FormField>
      <Button kind="primary" icon="Link" full onClick={submit} disabled={!isHttpsUrl(url) || importUrl.isPending}>
        {importUrl.isPending ? t("add.url.importing") : t("add.url.import")}
      </Button>
    </div>
  );
}
