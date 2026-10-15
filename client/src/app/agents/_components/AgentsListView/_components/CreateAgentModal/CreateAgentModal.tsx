"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, SearchableSelect, Textarea } from "@devdigest/ui";
import type { Provider } from "@devdigest/shared";
import { useCreateAgent, useProviderModels } from "@/lib/hooks/agents";
import { toModelOptions } from "@/lib/model-label";
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODAL_WIDTH, PROVIDER_DEFAULT_MODEL, PROVIDER_OPTIONS } from "./constants";
import { pickModel } from "./helpers";
import { s } from "./styles";

/** Create-agent modal — name/description/provider/model/system-prompt. The model is picked from the provider's live list. */
export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const create = useCreateAgent();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>(DEFAULT_PROVIDER);
  const [chosenModel, setChosenModel] = React.useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = React.useState(t("create.defaultSystemPrompt"));

  // Live model list of the selected provider (same source as the agent editor). Switching the provider swaps the list.
  const { data: models, isLoading: modelsLoading } = useProviderModels(provider);
  const listed = (models ?? []).map((m) => m.id);
  const model = pickModel(chosenModel, listed, PROVIDER_DEFAULT_MODEL[provider]);
  const modelOptions = toModelOptions(models);
  // Empty list after load = provider key missing/invalid — keep a free-text field so the agent can still be created.
  const noModels = !modelsLoading && listed.length === 0;

  const submit = async () => {
    const agent = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      provider,
      model,
      system_prompt: systemPrompt,
    });
    onClose();
    router.push(`/agents/${agent.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending || !model}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.provider")}>
          <SelectInput
            value={provider}
            onChange={(v) => {
              setProvider(v as Provider);
              setChosenModel(PROVIDER_DEFAULT_MODEL[v as Provider]);
            }}
            options={[...PROVIDER_OPTIONS]}
          />
        </FormField>
        <FormField
          label={t("create.fields.model")}
          hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
        >
          {noModels ? (
            <TextInput value={model} onChange={setChosenModel} mono />
          ) : (
            <SearchableSelect
              value={model}
              onChange={setChosenModel}
              options={modelOptions}
              placeholder={modelsLoading ? t("create.fields.modelLoading") : t("config.modelSearch")}
            />
          )}
        </FormField>
        <FormField label={t("create.fields.systemPrompt")}>
          <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={6} mono />
        </FormField>
      </div>
    </Modal>
  );
}
