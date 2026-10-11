/* VersionsTab — newest-first body history of a skill: current badge, inline diff
   against the current body and Restore (saves that body as a new version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/lib/toast";
import { diffLines, formatDate, summarizeChange } from "./helpers";
import { s } from "./styles";

const SIGN = { same: " ", add: "+", del: "−" } as const;

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const q = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diffOpen, setDiffOpen] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<SkillVersion | null>(null);
  const cancelRestore = React.useCallback(() => setRestoring(null), []);

  const versions = q.data;
  const current = versions?.find((v) => v.is_current);

  const titles = React.useMemo(
    () =>
      new Map(
        (versions ?? []).map((v, i) => {
          const prev = versions?.[i + 1];
          let title = t("versions.initial");
          if (v.change_note?.trim()) {
            title = v.change_note.trim();
          } else if (prev) {
            const { added, removed } = summarizeChange(prev.body, v.body);
            title =
              added === 0 && removed === 0
                ? t("versions.noChanges", { previous: prev.version })
                : t("versions.changes", { added, removed, previous: prev.version });
          }
          return [v.version, title] as const;
        }),
      ),
    [versions, t],
  );
  const openVersion = versions?.find((v) => v.version === diffOpen);
  const openDiff = React.useMemo(
    () => (openVersion && current ? diffLines(openVersion.body, current.body) : null),
    [openVersion, current],
  );

  const handleRestore = () => {
    if (!restoring) return;
    const from = restoring.version;
    update.mutate(
      { id: skill.id, patch: { body: restoring.body, change_note: t("versions.restoreNote", { version: from }) } },
      {
        onSuccess: (saved) => toast.success(t("versions.restored", { from, to: saved?.version ?? from })),
        onSettled: () => setRestoring(null),
      },
    );
  };

  if (q.isLoading) {
    return (
      <div style={s.list} aria-busy="true">
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }
  if (q.isError || !versions) {
    return <ErrorState title={t("versions.loadError")} onRetry={() => q.refetch()} />;
  }

  return (
    <div>
      <div style={s.head}>
        <h3 style={s.title}>{t("versions.title")}</h3>
        <span className="tnum" style={s.count}>
          {t("versions.count", { count: versions.length })}
        </span>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      <div style={s.list}>
        {versions.map((v) => {
          const open = diffOpen === v.version;
          return (
            <div key={v.version} style={s.item} data-testid={`version-${v.version}`}>
              <div style={s.row}>
                <span className="mono" style={s.chip(v.is_current)}>
                  v{v.version}
                </span>
                <div style={s.info}>
                  <div style={s.rowTitle}>{titles.get(v.version)}</div>
                  <div className="tnum" style={s.date}>
                    {formatDate(v.created_at)}
                  </div>
                </div>
                {v.is_current ? (
                  <span style={s.currentPill}>● {t("versions.current")}</span>
                ) : (
                  <div style={s.actions}>
                    <Button kind="secondary" size="sm" icon="Eye" onClick={() => setDiffOpen(open ? null : v.version)}>
                      {open ? t("versions.hideDiff") : t("versions.diff")}
                    </Button>
                    <Button kind="secondary" size="sm" icon="History" onClick={() => setRestoring(v)}>
                      {t("versions.restore")}
                    </Button>
                  </div>
                )}
              </div>
              {open && openDiff && (
                <div style={s.diff}>
                  <div style={s.diffTitle}>{t("versions.diffTitle", { version: v.version })}</div>
                  <div className="mono" style={s.diffBody}>
                    {openDiff.map((l, k) => (
                      <div key={k} data-kind={l.kind} style={s.line(l.kind)}>
                        <span style={s.sign}>{SIGN[l.kind]}</span>
                        <span>{l.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={restoring !== null}
        title={t("versions.restoreTitle", { version: restoring?.version ?? 0 })}
        body={t("versions.restoreBody", { version: restoring?.version ?? 0 })}
        confirmLabel={t("versions.restoreConfirm")}
        pending={update.isPending}
        onConfirm={handleRestore}
        onCancel={cancelRestore}
      />
    </div>
  );
}
