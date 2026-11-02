"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { DiffFinding } from "./_components/DiffFinding";
import { OrderToggle } from "./_components/OrderToggle";
import { RoleGroup } from "./_components/RoleGroup";
import { TokenNote } from "./_components/TokenNote";
import type { DiffOrder } from "./constants";
import { findingsByPath, groupPrFiles } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** owner/repo + head sha for the finding cards' GitHub deep-links. */
  repoFullName?: string | null;
  headSha?: string | null;
}

const NO_FINDINGS: ReadonlyMap<string, FindingRecord[]> = new Map();

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview.diffTab");
  const { data: comments } = usePrComments(prId);
  const { data: smartDiff } = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Findings stay visible by default (P1); their own toolbar button hides/shows them.
  const [showFindings, setShowFindings] = React.useState(true);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("postFailed"));
        throw err;
      }
    },
  };

  // While smart-diff loads or fails the viewer falls back to original order without findings.
  const byPath = React.useMemo(
    () => (smartDiff ? findingsByPath(smartDiff, reviews) : NO_FINDINGS),
    [smartDiff, reviews],
  );
  const findings = React.useMemo(
    () => ({
      byPath,
      showFindings,
      renderFinding: (f: FindingRecord) =>
        prId ? <DiffFinding finding={f} prId={prId} repoFullName={repoFullName} headSha={headSha} /> : null,
    }),
    [byPath, showFindings, prId, repoFullName, headSha],
  );
  const groups = React.useMemo(() => (smartDiff ? groupPrFiles(files, smartDiff) : []), [files, smartDiff]);
  const showGroups = !!smartDiff && order === "smart";

  const findingCount = React.useMemo(() => {
    let n = 0;
    for (const list of byPath.values()) n += list.length;
    return n;
  }, [byPath]);

  const toolbar = (
    <>
      {smartDiff && <OrderToggle order={order} onChange={setOrder} />}
      {commentCount > 0 && (
        <Button
          kind="ghost"
          size="sm"
          icon={showComments ? "EyeOff" : "Eye"}
          onClick={() => setShowComments((v) => !v)}
        >
          {showComments ? t("hideComments") : t("showComments")} ({commentCount})
        </Button>
      )}
      {findingCount > 0 && (
        <Button
          kind="ghost"
          size="sm"
          icon={showFindings ? "EyeOff" : "Eye"}
          onClick={() => setShowFindings((v) => !v)}
        >
          {showFindings ? t("hideFindings") : t("showFindings")} ({findingCount})
        </Button>
      )}
    </>
  );

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={<div style={s.toolbar}>{toolbar}</div>}
      >
        {t("title", { count: filesCount })}
      </SectionLabel>
      {smartDiff?.source_tokens != null && <TokenNote sourceTokens={smartDiff.source_tokens} />}
      {showGroups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <RoleGroup key={g.role} role={g.role} files={g.files} commenting={commenting} findings={findings} />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={smartDiff ? findings : undefined} />
      )}
    </section>
  );
}
