/* ConventionCard — one extracted candidate: rule (inline-editable), category, verified evidence
   (path:lines + snippet), confidence bar and Accept / Reject.
   Spec: client/specs/conventions.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { confidenceColor, confidencePct, formatEvidence } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  convention,
  onSetStatus,
  onEditRule,
}: {
  convention: ConventionCandidate;
  onSetStatus: (status: ConventionStatus) => void;
  onEditRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(convention.rule);
  const pct = confidencePct(convention.confidence);
  const evidence = formatEvidence(convention);
  const accepted = convention.status === "accepted";
  const rejected = convention.status === "rejected";

  const save = () => {
    const rule = draft.trim();
    if (rule && rule !== convention.rule) onEditRule(rule);
    setEditing(false);
  };

  return (
    <article style={s.card(convention.status)} data-testid="convention-card">
      <div style={s.main}>
        <div style={s.titleRow}>
          {editing ? (
            <div style={s.editRow}>
              <TextInput value={draft} onChange={setDraft} aria-label={t("card.ruleLabel")} />
              <Button size="sm" kind="primary" onClick={save}>
                {t("card.save")}
              </Button>
              <Button
                size="sm"
                kind="ghost"
                onClick={() => {
                  setDraft(convention.rule);
                  setEditing(false);
                }}
              >
                {t("card.cancel")}
              </Button>
            </div>
          ) : (
            <>
              <h3 style={s.rule}>{convention.rule}</h3>
              {convention.category && <Badge mono>{convention.category}</Badge>}
              <Button size="sm" kind="ghost" icon="Edit" onClick={() => setEditing(true)}>
                {t("card.edit")}
              </Button>
            </>
          )}
        </div>

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <span className="mono" style={s.path}>
              {evidence}
            </span>
            <IconBtn
              icon="Copy"
              label={t("card.copy")}
              size={24}
              onClick={() => void navigator.clipboard?.writeText(evidence)}
            />
          </div>
          <pre className="mono" style={s.snippet}>
            {convention.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidence}>
          <span>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={confidenceColor(pct)} />
          </div>
          <span className="mono tnum">{pct}%</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          onClick={() => onSetStatus(accepted ? "pending" : "accepted")}
          aria-pressed={accepted}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "secondary" : "ghost"}
          icon="X"
          onClick={() => onSetStatus(rejected ? "pending" : "rejected")}
          aria-pressed={rejected}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </article>
  );
}
