/* CreateTab — the standard add form (name, description, type, body). Also the landing form of a
   URL import: `prefill` fills it and `injection` shows the red warning; saving is still allowed
   (the skill is stored but blocked from agents until its text is fixed). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { SkillInjection, SkillSource, SkillType } from "@devdigest/shared";
import { InjectionBanner } from "@/components/skill-injection";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillForm, type SkillFields } from "../../../SkillForm";
import { s } from "./styles";

export interface Prefill extends SkillFields {
  source: SkillSource;
  injection?: SkillInjection;
}

const EMPTY: SkillFields = { name: "", description: "", type: "rubric" as SkillType, body: "" };

export function CreateTab({ prefill, onSaved }: { prefill?: Prefill; onSaved: (id: string) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [fields, setFields] = React.useState<SkillFields>(
    prefill ? { name: prefill.name, description: prefill.description, type: prefill.type, body: prefill.body } : EMPTY,
  );
  const valid = fields.name.trim().length > 0 && fields.body.trim().length > 0;
  // The scan covers the fetched text; once the user edits the body it is no longer what was scanned.
  const showInjection = !!prefill?.injection?.detected && fields.body === prefill.body && fields.name === prefill.name;

  const submit = () => {
    if (!valid) return;
    create.mutate(
      {
        name: fields.name.trim(),
        description: fields.description.trim(),
        type: fields.type,
        body: fields.body,
        ...(prefill ? { source: prefill.source } : {}),
      },
      {
        onSuccess: (saved) => {
          toast.success(t("editor.created", { name: saved.name }));
          onSaved(saved.id);
        },
      },
    );
  };

  return (
    <div>
      {prefill && <p style={s.hint}>{t("add.prefilled")}</p>}
      {showInjection && (
        <div style={s.banner}>
          <InjectionBanner injection={prefill?.injection} />
        </div>
      )}
      <SkillForm value={fields} onChange={setFields} />
      <Button kind="primary" icon="Check" full onClick={submit} disabled={!valid || create.isPending}>
        {create.isPending ? t("editor.saving") : t("editor.create")}
      </Button>
    </div>
  );
}
