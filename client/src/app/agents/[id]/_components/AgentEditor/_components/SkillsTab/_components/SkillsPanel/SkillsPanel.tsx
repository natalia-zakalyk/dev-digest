/* SkillsPanel — the body of the Skills tab: exactly one of loading skeletons,
   error, "no skills at all", "no filter match" or the list of rows. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILLS_HREF } from "../../constants";
import { SkillRow, type SkillRowDrag } from "../SkillRow";
import { s } from "./styles";

export function SkillsPanel({
  isLoading,
  isError,
  onRetry,
  total,
  linked,
  unlinked,
  dragFor,
  onToggle,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** All skills before filtering — 0 means the workspace has none. */
  total: number;
  /** Rows that match the filter, linked first (link order) then unlinked. */
  linked: Skill[];
  unlinked: Skill[];
  dragFor: (id: string) => SkillRowDrag;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("agents");

  if (isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }
  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={onRetry} />;
  if (total === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.empty")}
        body={
          <Link href={SKILLS_HREF} style={s.ctaLink}>
            {t("skills.emptyCta")}
          </Link>
        }
      />
    );
  }
  if (linked.length + unlinked.length === 0) return <p style={s.noMatch}>{t("skills.noMatch")}</p>;

  return (
    <ul style={s.list}>
      {linked.map((sk) => (
        <SkillRow key={sk.id} skill={sk} linked onToggle={() => onToggle(sk.id)} drag={dragFor(sk.id)} />
      ))}
      {unlinked.map((sk) => (
        <SkillRow key={sk.id} skill={sk} linked={false} onToggle={() => onToggle(sk.id)} drag={dragFor(sk.id)} />
      ))}
    </ul>
  );
}
