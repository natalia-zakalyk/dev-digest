/* /skills — Skills page (L02). Master-detail: SkillCards on the left, the
   selected skill's SkillDetail (tabs) on the right; "Add Skill ▾" → create (editor modal) or import (.md / .zip drawer).
   Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkillSummaries, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillDetail } from "./_components/SkillDetail";
import { SkillEditorModal } from "./_components/SkillEditorModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
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
  const selected = all.find((sk) => sk.id === selectedId);
  const editing = overlay.kind === "edit" ? all.find((sk) => sk.id === overlay.id) : undefined;

  // Auto-select the first skill when nothing (or a vanished skill) is selected.
  React.useEffect(() => {
    if (all.length > 0 && !all.some((sk) => sk.id === selectedId)) setSelectedId(all[0]!.id);
  }, [all, selectedId]);

  const onDeleted = (id: string) => {
    const next = all.find((sk) => sk.id !== id);
    setSelectedId(next ? next.id : null);
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.layout}>
        <aside style={s.left}>
          <div style={s.header}>
            <h1 style={s.title}>{t("page.heading")}</h1>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("page.addSkill")}
                </Button>
              }
              items={[
                { label: t("page.menu.create"), icon: "Edit", onClick: () => setOverlay({ kind: "create" }) },
                { label: t("page.menu.import"), icon: "Upload", onClick: () => setOverlay({ kind: "import" }) },
              ]}
            />
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
              onCta={() => setOverlay({ kind: "create" })}
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
                  selected={sk.id === selectedId}
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
              onDeleted={() => onDeleted(selected.id)}
              onToggle={(enabled) => update.mutate({ id: selected.id, patch: { enabled } })}
            />
          ) : (
            !isLoading && <p style={s.select}>{t("detail.select")}</p>
          )}
        </div>
      </div>

      {overlay.kind === "create" && <SkillEditorModal onClose={close} />}
      {editing && <SkillEditorModal skill={editing} onClose={close} />}
      {overlay.kind === "import" && (
        <ImportSkillDrawer
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
