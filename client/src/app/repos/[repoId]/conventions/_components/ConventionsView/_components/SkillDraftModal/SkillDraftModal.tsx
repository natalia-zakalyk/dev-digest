/* SkillDraftModal — "Create skill from conventions": loads the merged draft of the accepted
   conventions, lets the user edit name / description / type / enabled / body, then saves via
   POST /skills (source "extracted"). Cancel writes nothing. Spec: client/specs/conventions.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, ErrorState, FormField, Modal, SelectInput, Skeleton, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useConventionSkillDraft } from "@/lib/hooks/conventions";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateSkill, useLinkSkillToAgent } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "../../helpers";
import { BODY_ROWS, MODAL_WIDTH, SKILL_TYPES } from "./constants";
import { s } from "./styles";

export function SkillDraftModal({
  repoId,
  repoName,
  conventionIds,
  onClose,
}: {
  repoId: string;
  repoName: string;
  conventionIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const draft = useConventionSkillDraft(repoId);
  const create = useCreateSkill();
  const link = useLinkSkillToAgent();
  const agents = useAgents();
  const [agentIds, setAgentIds] = React.useState<string[]>([]);
  const toggleAgent = (id: string) =>
    setAgentIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);

  const { mutate: loadDraft } = draft;
  React.useEffect(() => {
    loadDraft(conventionIds, {
      onSuccess: (d) => {
        setName(d.name);
        setDescription(d.description);
        setType(d.type);
        setBody(d.body);
        setLoaded(true);
      },
    });
    // The draft is requested once per open; later edits are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = loaded && name.trim().length > 0 && body.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    create.mutate(
      { name: name.trim(), description: description.trim(), type, body, enabled, source: "extracted" },
      {
        onSuccess: (saved) => {
          toast.success(t("modal.created", { name: saved.name }));
          // Optional "link to agents" step: one link call per ticked agent.
          Promise.all(agentIds.map((agentId) => link.mutateAsync({ agentId, skillId: saved.id }).then(() => true, () => false))).then(
            (results) => {
              const failed = results.filter((ok) => !ok).length;
              if (agentIds.length > 0 && failed === 0) toast.success(t("modal.linked", { count: agentIds.length }));
              if (failed > 0) toast.error(t("modal.linkFailed", { count: failed }));
            },
          );
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={name || undefined}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.meta}>{t("modal.footnote")}</span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {draft.isError ? (
          <ErrorState body={t("modal.draftError")} onRetry={() => loadDraft(conventionIds)} />
        ) : !loaded ? (
          <Skeleton height={240} />
        ) : (
          <>
            <div style={s.banner}>{t("modal.banner", { count: conventionIds.length, repo: repoName })}</div>
            <FormField label={t("modal.name")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("modal.description")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <div style={s.row}>
              <FormField label={t("modal.type")}>
                <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={[...SKILL_TYPES]} />
              </FormField>
              <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
                <Toggle on={enabled} onChange={setEnabled} />
              </FormField>
            </div>
            <FormField label={t("modal.linkAgents")} hint={t("modal.linkAgentsHint")}>
              <div style={s.agents}>
                {(agents.data ?? []).length === 0 && <span style={s.meta}>{t("modal.noAgents")}</span>}
                {(agents.data ?? []).map((a) => (
                  <Checkbox key={a.id} checked={agentIds.includes(a.id)} onChange={() => toggleAgent(a.id)} label={a.name} />
                ))}
              </div>
            </FormField>
            <FormField
              label={t("modal.body")}
              required
              right={<span className="mono tnum" style={s.meta}>{t("modal.tokens", { count: estimateTokens(body) })}</span>}
            >
              <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
            </FormField>
            {create.isError && <ErrorState body={t("modal.createError")} onRetry={submit} />}
          </>
        )}
      </div>
    </Modal>
  );
}
