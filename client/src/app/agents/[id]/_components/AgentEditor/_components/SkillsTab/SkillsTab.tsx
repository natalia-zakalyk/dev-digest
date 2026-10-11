/* SkillsTab — which workspace skills this agent uses, and in what order.
   Checkbox = link / unlink (linked = enabled for this agent); linked rows can be
   reordered with native HTML5 drag-and-drop or Alt + ↑/↓ on the handle. The
   order is the order of the skill blocks in the assembled prompt. Every change
   saves immediately (optimistic). A globally disabled skill stays linked but is
   left out of the prompt — shown muted. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { SKILLS_HREF } from "./constants";
import { matchesFilter, moveItem, orderedSkills, toggleLinked } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const isLoading = skillsQuery.isLoading || linksQuery.isLoading;
  const isError = skillsQuery.isError || linksQuery.isError;
  const { linked, unlinked } = orderedSkills(skillsQuery.data ?? [], linksQuery.data ?? []);
  const linkedIds = linked.map((sk) => sk.id);
  const total = linked.length + unlinked.length;

  const save = (ids: string[]) => setSkills.mutate(ids);
  const move = (id: string, to: number) => save(moveItem(linkedIds, linkedIds.indexOf(id), to));

  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) move(dragId, linkedIds.indexOf(targetId));
    setDragId(null);
    setOverId(null);
  };

  const onHandleKey = (e: React.KeyboardEvent, id: string) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const from = linkedIds.indexOf(id);
    move(id, e.key === "ArrowUp" ? from - 1 : from + 1);
  };

  const renderRow = (sk: Skill, isLinked: boolean) => {
    const draggable = isLinked;
    return (
      <li
        key={sk.id}
        data-testid={`skill-row-${sk.name}`}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                setDragId(sk.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", sk.id);
              }
            : undefined
        }
        onDragOver={
          draggable && dragId
            ? (e) => {
                e.preventDefault();
                if (overId !== sk.id) setOverId(sk.id);
              }
            : undefined
        }
        onDrop={draggable ? () => onDrop(sk.id) : undefined}
        onDragEnd={() => {
          setDragId(null);
          setOverId(null);
        }}
        style={s.row({ linked: isLinked, dragging: dragId === sk.id, over: overId === sk.id && dragId !== sk.id })}
      >
        {isLinked ? (
          <button
            type="button"
            aria-label={t("skills.dragHandle", { name: sk.name })}
            title={t("skills.dragHandle", { name: sk.name })}
            onKeyDown={(e) => onHandleKey(e, sk.id)}
            style={s.handle}
          >
            <Icon.Menu size={14} />
          </button>
        ) : (
          <span style={s.handlePlaceholder} />
        )}
        <Checkbox
          checked={isLinked}
          onChange={() => save(toggleLinked(linkedIds, sk.id))}
          label={
            <span className="mono" style={s.name(sk.enabled)}>
              {sk.name}
            </span>
          }
        />
        {!sk.enabled && (
          <Badge color="var(--text-muted)" bg="var(--bg-hover)" icon="EyeOff">
            {t("skills.disabledGlobally")}
          </Badge>
        )}
        <span style={s.typeCell}>
          <SkillTypeBadge type={sk.type} />
        </span>
      </li>
    );
  };

  const visibleLinked = linked.filter((sk) => matchesFilter(sk, filter));
  const visibleUnlinked = unlinked.filter((sk) => matchesFilter(sk, filter));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        {!isLoading && !isError && (
          <Badge color="var(--accent)" bg="var(--accent-bg)">
            {t("skills.enabledCount", { linked: linked.length, total })}
          </Badge>
        )}
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {isLoading && (
        <div style={s.list}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      )}
      {isError && (
        <ErrorState
          body={t("skills.loadError")}
          onRetry={() => {
            void skillsQuery.refetch();
            void linksQuery.refetch();
          }}
        />
      )}
      {!isLoading && !isError && total === 0 && (
        <EmptyState
          icon="Sparkles"
          title={t("skills.empty")}
          cta={t("skills.emptyCta")}
          onCta={() => router.push(SKILLS_HREF)}
        />
      )}
      {!isLoading && !isError && total > 0 && visibleLinked.length + visibleUnlinked.length === 0 && (
        <p style={s.hint}>{t("skills.noMatch")}</p>
      )}
      {!isLoading && !isError && (
        <ul style={s.list}>
          {visibleLinked.map((sk) => renderRow(sk, true))}
          {visibleUnlinked.map((sk) => renderRow(sk, false))}
        </ul>
      )}
    </div>
  );
}
