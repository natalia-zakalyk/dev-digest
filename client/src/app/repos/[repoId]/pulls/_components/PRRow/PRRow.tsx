/* PRRow — one row in the PR list table. Ported from screen_dashboard.jsx.
   The whole row links to the PR (stretched-link pattern: the title is the one
   real <a>, its ::after overlays the row); the FINDINGS counters sit above the
   overlay so they stay interactive without nesting buttons inside the link. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsSeverity } from "@/components/severity-counts";
import { usePrReviews } from "@/lib/hooks/reviews";
import { latestReviewPerAgent } from "@/lib/findings";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={s.row(h)}>
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <Link
            href={`/repos/${repoId}/pulls/${pr.number}`}
            className="dd-stretched-link"
            style={s.rowTitle(h)}
          >
            {pr.title}
          </Link>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size])}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={s.raised}>
        <PrFindings pr={pr} />
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div>
        <RunCostBadge variant="compact" usd={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}

/** FINDINGS cell: counts come with the list; the findings themselves load only
   once a counter is clicked (shared ["reviews", prId] cache with PR detail). */
function PrFindings({ pr }: { pr: PrMeta }) {
  const [open, setOpen] = React.useState(false);
  const { data: reviews, isLoading } = usePrReviews(open ? pr.id : null);
  const findings = React.useMemo(
    () => (reviews ? latestReviewPerAgent(reviews).flatMap((r) => r.findings) : undefined),
    [reviews],
  );
  return (
    <FindingsSeverity counts={pr.findings} findings={findings} loading={isLoading} onOpenChange={setOpen} />
  );
}
