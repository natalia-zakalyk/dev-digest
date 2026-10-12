/* /skills — Skills page (L02). Master-detail: SkillCards on the left, the
   selected skill's SkillDetail (tabs) on the right; "Add Skill ▾" → create (editor modal) or import (.md / .zip drawer).
   Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkillSummaries, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillDetail } from "./_components/SkillDetail";
import { SkillEditorModal } from "./_components/SkillEditorModal";
import { AddSkillModal } from "./_components/AddSkillModal";
import type { SkillsOverlay } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const summaries = useSkillSummaries();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [overlay, setOverlay] = React.useState<SkillsOverlay>({ kind: "none" });
  const close = React.useCallback(() => setOverlay({ kind: "none" }), []);

  const all = skills ?? [];
  const summaryById = React.useMemo(
    () => new Map((summaries.data ?? []).map((sm) => [sm.skill_id, sm])),
    [summaries.data],
  );
  const list = filterSkills(all, search);
  // Derived during render: the chosen skill, else (nothing chosen / vanished) the first one.
  const selected = all.find((sk) => sk.id === selectedId) ?? all[0];
  const editing = overlay.kind === "edit" ? all.find((sk) => sk.id === overlay.id) : undefined;

  const onDeleted = () => setSelectedId(null);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.layout}>
        <aside style={s.left}>
          <div style={s.header}>
            <h1 style={s.title}>{t("page.heading")}</h1>
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setOverlay({ kind: "add" })}>
              {t("page.addSkill")}
            </Button>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>

          {isLoading && (
            <div style={s.list}>
              <Skeleton height={129} />
              <Skeleton height={129} />
              <Skeleton height={129} />
            </div>
          )}
          {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && all.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => setOverlay({ kind: "add" })}
            />
          )}
          {all.length > 0 && list.length === 0 && (
            <p style={s.noMatch}>{t("page.noMatch", { query: search.trim() })}</p>
          )}
          {list.length > 0 && (
            <div style={s.list}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  summary={summaryById.get(sk.id)}
                  selected={sk.id === selected?.id}
                  onOpen={() => setSelectedId(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                />
              ))}
            </div>
          )}
        </aside>

        <div style={s.right}>
          {selected ? (
            <SkillDetail
              key={selected.id}
              skill={selected}
              onEdit={() => setOverlay({ kind: "edit", id: selected.id })}
              onDeleted={onDeleted}
              onToggle={(enabled) => update.mutate({ id: selected.id, patch: { enabled } })}
            />
          ) : (
            !isLoading && <p style={s.select}>{t("detail.select")}</p>
          )}
        </div>
      </div>

      {editing && <SkillEditorModal skill={editing} onClose={close} />}
      {overlay.kind === "add" && (
        <AddSkillModal
          onClose={close}
          onSaved={(id) => {
            setSelectedId(id);
            close();
          }}
        />
      )}
    </AppShell>
  );
}
